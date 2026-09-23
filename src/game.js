/**
 * game.js — CodeBreaker game logic: cipher mechanics, scribble notes, audio,
 * persistence, monetization/achievements, and UI wiring.
 *
 * Depends on globals from (loaded before this file in index.html):
 *   analytics.js  -> window.ANALYTICS
 *   constants.js  -> window.CONSTANTS
 *   words-db.js   -> window.WORDSDB
 * Optionally: window.electronAPI (injected by preload.js under Electron).
 */
(function () {
  'use strict';

  const CONFIG = CONSTANTS.CONFIG;
  const THEME_COLORS = { default: '#667eea', neon: '#39ff14', gold: '#d4af37' };

  // ===========================================================================
  // Cipher helpers
  // ===========================================================================
  function wordToNumbers(word) {
    return word.split('').map((letter) => letter.charCodeAt(0) - 64);
  }

  function numbersToLetters(numbers) {
    return numbers.map((n) => String.fromCharCode(64 + n)).join('');
  }

  function scrambleNumbers(numbers) {
    const scrambled = [...numbers];
    for (let i = scrambled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [scrambled[i], scrambled[j]] = [scrambled[j], scrambled[i]];
    }
    return scrambled.map((n) => n.toString()).join('');
  }

  /** All ways `sequence` can be split into tokens of 1-26 (i.e. A-Z). */
  function parseNumberSequence(sequence) {
    const possibilities = [];
    function backtrack(index, current) {
      if (index === sequence.length) {
        if (current.length > 0) possibilities.push([...current]);
        return;
      }
      if (index < sequence.length) {
        const single = parseInt(sequence[index], 10);
        if (single >= 1 && single <= 9) {
          current.push(single);
          backtrack(index + 1, current);
          current.pop();
        }
      }
      if (index + 1 < sequence.length) {
        const double = parseInt(sequence.substr(index, 2), 10);
        if (double >= 10 && double <= 26) {
          current.push(double);
          backtrack(index + 2, current);
          current.pop();
        }
      }
    }
    backtrack(0, []);
    return possibilities;
  }

  function checkForAmbiguity(sequence) {
    return parseNumberSequence(sequence)
      .map((numbers) => ({ numbers, letters: numbersToLetters(numbers) }))
      .filter((candidate) => WORDSDB.isValidWord(candidate.letters));
  }

  function pickSumCheckpoints(wordLength, count) {
    const positions = new Set();
    const target = Math.min(count, wordLength);
    for (let k = 1; k <= target; k++) {
      const pos = Math.max(0, Math.min(wordLength - 1, Math.floor((k * wordLength) / (target + 1))));
      positions.add(pos);
    }
    let i = 0;
    while (positions.size < target && i < wordLength) {
      positions.add(i);
      i++;
    }
    return positions;
  }

  // ===========================================================================
  // Audio (synthesized — no external asset files)
  // ===========================================================================
  const AudioFX = (function () {
    let ctx = null;
    let enabled = true;

    function getCtx() {
      if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
      if (ctx.state === 'suspended') ctx.resume();
      return ctx;
    }

    function tone(freq, start, duration, type = 'sine', peak = 0.15) {
      if (!enabled) return;
      try {
        const c = getCtx();
        const osc = c.createOscillator();
        const gain = c.createGain();
        osc.type = type;
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0, c.currentTime + start);
        gain.gain.linearRampToValueAtTime(peak, c.currentTime + start + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + start + duration);
        osc.connect(gain).connect(c.destination);
        osc.start(c.currentTime + start);
        osc.stop(c.currentTime + start + duration + 0.02);
      } catch {
        // AudioContext unavailable/blocked — fail silently, sound is a nice-to-have.
      }
    }

    return {
      setEnabled: (v) => { enabled = v; },
      isEnabled: () => enabled,
      correct: () => { tone(523.25, 0, 0.12); tone(659.25, 0.1, 0.12); tone(783.99, 0.2, 0.22); },
      incorrect: () => tone(233.08, 0, 0.25, 'sawtooth', 0.1),
      invalid: () => tone(160, 0, 0.15, 'square', 0.08),
      click: () => tone(440, 0, 0.05, 'sine', 0.06),
      achievement: () => { tone(659.25, 0, 0.1); tone(880, 0.1, 0.1); tone(1174.66, 0.2, 0.25); }
    };
  })();

  // ===========================================================================
  // Persistence (Electron IPC file store, or localStorage on web/mobile)
  // ===========================================================================
  const STORAGE_KEY = 'codebreaker:profile';
  const Persistence = {
    async load() {
      if (window.electronAPI) return window.electronAPI.storage.get();
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        return raw ? JSON.parse(raw) : null;
      } catch {
        return null;
      }
    },
    async save(profile) {
      if (window.electronAPI) return window.electronAPI.storage.set(profile);
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
      } catch {
        // Storage unavailable (private browsing, quota) — progress just won't persist.
      }
      // If cloud save is enabled and session exists, also push to cloud.
      if (profile.settings?.cloudSaveEnabled && typeof window.SupabaseClient !== 'undefined') {
        try {
          const session = await window.SupabaseClient.getSession();
          if (session) {
            await window.SupabaseClient.upsertProfile({
              display_name: profile.displayName || 'Player',
              shards: profile.shards,
              correct_guesses: profile.correctGuesses,
              total_attempts: profile.totalAttempts,
              best_round: profile.bestRound,
              best_streak: profile.bestStreak,
              fastest_solve_ms: profile.fastestSolveMs,
              solved_ambiguous_count: profile.solvedAmbiguousCount,
              has_seen_rules: profile.hasSeenRules,
              achievements: profile.achievements,
              purchases: profile.purchases,
              settings: profile.settings
            });
          }
        } catch (err) {
          console.warn('Cloud sync failed:', err.message);
          // Silently fail — local save succeeded, cloud sync is optional.
        }
      }
    },
    async pullFromCloud() {
      if (typeof window.SupabaseClient === 'undefined') return null;
      try {
        const session = await window.SupabaseClient.getSession();
        if (!session) return null;
        const profile = await window.SupabaseClient.fetchProfile();
        if (!profile) return null;
        // Map cloud profile to local structure
        return {
          shards: profile.shards,
          correctGuesses: profile.correct_guesses,
          totalAttempts: profile.total_attempts,
          bestRound: profile.best_round,
          bestStreak: profile.best_streak,
          fastestSolveMs: profile.fastest_solve_ms,
          solvedAmbiguousCount: profile.solved_ambiguous_count,
          hasSeenRules: profile.has_seen_rules,
          achievements: profile.achievements || {},
          purchases: profile.purchases || {},
          settings: profile.settings || {}
        };
      } catch (err) {
        console.warn('Cloud pull failed:', err.message);
        return null;
      }
    }
  };

  function defaultProfile() {
    return {
      shards: CONFIG.startingShards,
      correctGuesses: 0,
      totalAttempts: 0,
      bestRound: 1,
      bestStreak: 0,
      fastestSolveMs: null,
      solvedAmbiguousCount: 0,
      hasSeenRules: false,
      achievements: {},
      purchases: {},
      settings: { audioEnabled: true, inkTheme: 'default', adsFree: false, showAlphabet: true },
      dailyStreak: 0,
      dailyBestRound: 0,
      lastDailyPlayDate: null,
      dailyResults: {}
    };
  }

  // ===========================================================================
  // Monetization: soft currency, IAP catalog (simulated), ads stub
  // ===========================================================================
  // NOTE — sandbox mode: there is no real payment backend wired up here.
  // purchase() below applies the entitlement locally and logs the intent.
  // To ship real monetization, replace purchase() with calls into:
  //   - Steam: Steamworks micro-transactions (ISteamMicroTxn) from the
  //     Electron main process via steamworks.js/Greenworks, IPC'd like storage:*.
  //   - iOS/Android: a Capacitor IAP plugin (StoreKit / Play Billing) that
  //     validates the receipt server-side before granting entitlements.
  const MONETIZATION_CATALOG = [
    { id: 'ad_free', type: 'ad-free', name: 'Remove Ads', desc: 'Disable ads permanently on this device.', price: '$2.99', consumable: false, grantsAdsFree: true },
    { id: 'shards_small', type: 'currency', name: 'Small Shard Pouch', desc: '+200 Shards', price: '$0.99', consumable: true, grantsShards: 200 },
    { id: 'shards_large', type: 'currency', name: 'Large Shard Chest', desc: '+1200 Shards', price: '$4.99', consumable: true, grantsShards: 1200 },
    { id: 'hint_pack', type: 'hint-pack', name: 'Hint Pack', desc: `Instantly grants 150 Shards (~${Math.floor(150 / CONFIG.hintCostShards)} hints).`, price: '$1.99', consumable: true, grantsShards: 150 },
    { id: 'cosmetic_neon', type: 'cosmetics', name: 'Neon Ink Theme', desc: 'Neon green ink & accents.', price: '$0.99', consumable: false, grantsTheme: 'neon' },
    { id: 'cosmetic_gold', type: 'cosmetics', name: 'Gold Ink Theme', desc: 'Gold ink & accents.', price: '$0.99', consumable: false, grantsTheme: 'gold' },
    { id: 'season_pass', type: 'season-pass', name: 'Season Pass (Monthly)', desc: 'Exclusive gold theme + supports development. Simulated — no recurring billing is wired up.', price: '$9.99/mo', consumable: false, grantsTheme: 'gold' }
  ];

  const AdManager = {
    // TODO: wire to a real SDK — e.g. @capacitor-community/admob on mobile.
    // Desktop/Steam builds typically ship ad-free and skip this entirely.
    showInterstitial() {
      if (state.profile.settings.adsFree) return;
      console.log('[Ads] (sandbox) would show an interstitial ad here');
      ANALYTICS.track('ad_interstitial_shown', { sandbox: true });
    }
  };

  const ACHIEVEMENTS = [
    { id: 'first_blood', icon: '\u{1F3AF}', name: 'First Crack', desc: 'Solve your first code.', check: (p) => p.correctGuesses >= 1 },
    { id: 'ten_correct', icon: '\u{1F51F}', name: 'Code Adept', desc: 'Solve 10 codes.', check: (p) => p.correctGuesses >= 10 },
    { id: 'fifty_correct', icon: '\u{1F3C5}', name: 'Code Veteran', desc: 'Solve 50 codes.', check: (p) => p.correctGuesses >= 50 },
    { id: 'century', icon: '\u{1F4AF}', name: 'Century Breaker', desc: 'Solve 100 codes.', check: (p) => p.correctGuesses >= 100 },
    { id: 'streak_5', icon: '\u{1F525}', name: 'On a Roll', desc: '5 correct in a row.', check: (p) => p.bestStreak >= 5 },
    { id: 'streak_10', icon: '⚡', name: 'Unstoppable', desc: '10 correct in a row.', check: (p) => p.bestStreak >= 10 },
    { id: 'quick_thinker', icon: '\u{1F9E0}', name: 'Quick Thinker', desc: 'Solve a code in under 10 seconds.', check: (p) => p.fastestSolveMs != null && p.fastestSolveMs < CONFIG.quickThinkerMs },
    { id: 'ambiguity_master', icon: '\u{1F9E9}', name: 'Ambiguity Master', desc: 'Solve a code that had multiple valid interpretations.', check: (p) => p.solvedAmbiguousCount >= 1 },
    { id: 'grandmaster', icon: '\u{1F451}', name: 'Grandmaster', desc: 'Reach round 16 (11-letter words).', check: (p) => p.bestRound >= 16 }
  ];

  function checkAchievements(profile) {
    const unlocked = [];
    ACHIEVEMENTS.forEach((a) => {
      if (!profile.achievements[a.id] && a.check(profile)) {
        profile.achievements[a.id] = true;
        unlocked.push(a);
      }
    });
    return unlocked;
  }

  // ===========================================================================
  // Game state
  // ===========================================================================
  const state = {
    profile: defaultProfile(),
    run: {
      round: 1,
      streak: 0,
      attemptsThisRound: 0,
      currentWord: '',
      currentNumbers: '',
      scrambledSequence: '',
      roundStartTime: 0,
      roundIsAmbiguous: false,
      isActive: true
    },
    difficulty: 'medium',
    dom: {},
  };

  function q(id) { return document.getElementById(id); }

  function cacheDom() {
    const ids = [
      'currentRound', 'correctGuesses', 'totalAttempts', 'streakValue',
      'challengeNumbers', 'wordLengthHint', 'difficultyHint',
      'scribblePad', 'clearCanvasBtn', 'ambiguityWarning', 'parsingOptions',
      'letterContainer', 'submitBtn', 'nextWordBtn', 'hintBtn', 'hintCost', 'newGameBtn', 'clearBtn',
      'result', 'resultText', 'validityIndicator', 'validityText',
      'shardsValue', 'audioToggleBtn', 'achievementsBtn', 'storeBtn', 'settingsBtn', 'rulesBtn', 'rulesModal',
      'languageToggleBtn', 'themeToggleBtn', 'alphabetToggleBtn', 'alphabetReference',
      'bestRoundValue', 'lifetimeCorrectValue', 'achievementsCountValue', 'alphabetGrid',
      'storeModal', 'storeItems', 'achievementsModal', 'achievementsList',
      'settingsModal', 'audioToggleCheckbox', 'inkThemeSelect', 'adsStatusLabel', 'cloudSaveToggle',
      'appVersionLabel', 'aboutVersionLabel', 'aboutModal', 'resetProgressBtn',
      'toast', 'loadingOverlay', 'loadingText', 'footerVersion',
      'languageSelect', 'themeSelect',
      'languageScreen', 'enLangBtn', 'frLangBtn', 'langScreenMenuBtn',
      'gameMenu', 'easyBtn', 'mediumBtn', 'hardBtn', 'playBtn', 'menuSettingsBtn',
      'dailyChallengeBtn', 'dailyStats', 'dailyStreakValue', 'dailyBestRoundValue'
    ];
    ids.forEach((id) => { state.dom[id] = q(id); });
  }

  // ===========================================================================
  // Toast
  // ===========================================================================
  let toastTimer = null;
  function showToast(message) {
    const el = state.dom.toast;
    el.textContent = message;
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.hidden = true; }, 2600);
  }

  // ===========================================================================
  // Scribble area (typed notes)
  // ===========================================================================
  function clearScribble() {
    state.dom.scribblePad.value = '';
  }

  function applyInkTheme() {
    state.dom.scribblePad.style.color = THEME_COLORS[state.profile.settings.inkTheme] || THEME_COLORS.default;
  }

  // ===========================================================================
  // Letter boxes
  // ===========================================================================
  function createLetterBoxes(wordLength) {
    const container = state.dom.letterContainer;
    container.innerHTML = '';

    const tier = getTierForRound(state.run.round);
    const checkpoints = pickSumCheckpoints(wordLength, tier.sumHints);
    const numbers = wordToNumbers(state.run.currentWord);
    let cumulative = 0;

    for (let i = 0; i < wordLength; i++) {
      const wrapper = document.createElement('div');
      wrapper.className = 'letter-box-wrapper';

      const box = document.createElement('input');
      box.className = 'letter-box';
      box.type = 'text';
      box.maxLength = 1;
      box.autocomplete = 'off';
      box.spellcheck = false;
      box.dataset.index = String(i);

      cumulative += numbers[i];
      const sumDisplay = document.createElement('div');
      sumDisplay.className = 'cumulative-sum';
      if (checkpoints.has(i)) {
        sumDisplay.textContent = String(cumulative);
        sumDisplay.title = `Sum of the first ${i + 1} letters' values`;
      } else {
        sumDisplay.style.visibility = 'hidden';
      }

      box.addEventListener('input', function onInput() {
        this.value = this.value.replace(/[^a-zA-Z]/g, '').toUpperCase();
        if (this.value) {
          this.classList.add('filled');
          const next = container.children[i + 1];
          next?.querySelector('.letter-box')?.focus();
        } else {
          this.classList.remove('filled');
        }
      });

      box.addEventListener('keydown', (e) => {
        if (e.key === 'Backspace' && !box.value && i > 0) {
          const prevBox = container.children[i - 1]?.querySelector('.letter-box');
          if (prevBox) {
            prevBox.focus();
            prevBox.value = '';
            prevBox.classList.remove('filled', 'hinted');
          }
        } else if (e.key === 'Enter') {
          submitGuess();
        }
      });

      wrapper.appendChild(box);
      wrapper.appendChild(sumDisplay);
      container.appendChild(wrapper);
    }

    container.children[0]?.querySelector('.letter-box')?.focus();
  }

  function getGuessFromBoxes() {
    return Array.from(state.dom.letterContainer.querySelectorAll('.letter-box'))
      .map((box) => box.value.toUpperCase())
      .join('');
  }

  function clearLetterBoxes() {
    state.dom.letterContainer.querySelectorAll('.letter-box-wrapper').forEach((wrapper, index) => {
      const box = wrapper.querySelector('.letter-box');
      box.value = '';
      box.classList.remove('filled', 'hinted');
      if (index === 0) box.focus();
    });
  }

  function useHint() {
    if (!state.run.isActive) return;
    const cost = CONFIG.hintCostShards;
    if (state.profile.shards < cost) {
      showToast(`Not enough shards — hints cost ${cost}◆`);
      return;
    }
    const boxes = Array.from(state.dom.letterContainer.querySelectorAll('.letter-box'));
    const emptyBox = boxes.find((b) => !b.value);
    if (!emptyBox) {
      showToast('No empty boxes left to hint');
      return;
    }
    const index = Number(emptyBox.dataset.index);
    emptyBox.value = state.run.currentWord[index];
    emptyBox.classList.add('filled', 'hinted');

    state.profile.shards -= cost;
    updateShardsDisplay();
    persistProfile();
    ANALYTICS.track('hint_used', { round: state.run.round, cost });

    const next = boxes[index + 1];
    if (next) next.focus();
  }

  // ===========================================================================
  // Round flow
  // ===========================================================================
  function showSubmitButton() {
    state.dom.submitBtn.hidden = false;
    state.dom.nextWordBtn.hidden = true;
  }

  function startNewRound() {
    showSubmitButton();
    const tier = getTierForRound(state.run.round);
    state.run.currentWord = WORDSDB.randomWordForTier(tier);
    const numbers = wordToNumbers(state.run.currentWord);
    state.run.currentNumbers = numbers.join('-');
    state.run.scrambledSequence = scrambleNumbers(numbers);
    state.run.attemptsThisRound = 0;
    state.run.roundStartTime = Date.now();

    const ambiguousMatches = checkForAmbiguity(state.run.scrambledSequence);
    state.run.roundIsAmbiguous = ambiguousMatches.length > 1;
    renderAmbiguity(ambiguousMatches);

    const i18n = window.I18n;
    state.dom.challengeNumbers.textContent = state.run.scrambledSequence;
    const wordLengthKey = i18n.t('wordLength');
    state.dom.wordLengthHint.textContent = wordLengthKey.replace('?', state.run.currentWord.length);
    const roundKey = i18n.t('round');
    state.dom.difficultyHint.textContent = `${i18n.t('difficulty').replace('—', tier.label)} (${roundKey} ${state.run.round})`;
    state.dom.currentRound.textContent = String(state.run.round);
    state.dom.streakValue.textContent = String(state.run.streak);

    createLetterBoxes(state.run.currentWord.length);

    state.dom.resultText.textContent = i18n.t('makeGuess');
    state.dom.result.className = 'result empty';
    state.dom.validityIndicator.style.display = 'none';

    ANALYTICS.track('round_start', { round: state.run.round, wordLength: state.run.currentWord.length, ambiguous: state.run.roundIsAmbiguous });
  }

  function renderAmbiguity(matches) {
    const warning = state.dom.ambiguityWarning;
    const optionsContainer = state.dom.parsingOptions;
    if (matches.length > 1) {
      warning.style.display = 'block';
      optionsContainer.innerHTML = '';
      matches.forEach((m) => {
        const el = document.createElement('div');
        el.className = 'parsing-option';
        el.textContent = `${m.numbers.join('-')} = ${m.letters}`;
        optionsContainer.appendChild(el);
      });
    } else {
      warning.style.display = 'none';
    }
  }

  function newGame() {
    showMenu();
    AudioFX.click();
  }

  function goToNextWord() {
    clearScribble();
    state.dom.validityIndicator.style.display = 'none';
    state.run.round += 1;
    state.run.isActive = true;
    startNewRound();
  }

  function submitGuess() {
    if (!state.dom.nextWordBtn.hidden) return goToNextWord();
    if (!state.run.isActive) return;
    const guess = getGuessFromBoxes();

    if (!guess || guess.length !== state.run.currentWord.length) {
      return showError('Please fill in all letter boxes!');
    }
    if (!/^[A-Z]+$/.test(guess)) {
      return showError('Please enter only letters!');
    }

    state.run.attemptsThisRound += 1;
    state.profile.totalAttempts += 1;
    state.dom.totalAttempts.textContent = String(state.profile.totalAttempts);

    const indicator = state.dom.validityIndicator;
    const validityText = state.dom.validityText;
    indicator.style.display = 'block';
    indicator.className = 'validity-indicator checking';
    validityText.innerHTML = 'Checking your guess<span class="loading-dots">...</span>';

    setTimeout(() => resolveGuess(guess), 500);
  }

  function resolveGuess(guess) {
    const indicator = state.dom.validityIndicator;
    const validityText = state.dom.validityText;
    const result = state.dom.result;

    const isValidWordGuess = WORDSDB.isValidWord(guess);
    const isCorrect = guess === state.run.currentWord;


    const guessNumbers = wordToNumbers(guess);
    state.dom.resultText.textContent = guessNumbers.join('-');
    result.className = 'result';

    if (isCorrect) {
      handleCorrectGuess(result, indicator, validityText);
    } else if (isValidWordGuess) {
      handleValidButWrongGuess(result, indicator, validityText);
    } else {
      handleInvalidGuess(result, indicator, validityText);
    }
  }

  function awardShardsForRound() {
    let shards = CONFIG.shardsPerCorrect;
    if (state.run.attemptsThisRound === 1) shards += CONFIG.shardsBonusNoMistakes;
    if (state.run.roundIsAmbiguous) shards += CONFIG.shardsBonusAmbiguousSolve;
    return shards;
  }

  function handleCorrectGuess(result, indicator, validityText) {
    AudioFX.correct();
    result.classList.add('correct');
    indicator.className = 'validity-indicator valid';

    const solveMs = Date.now() - state.run.roundStartTime;
    const shardsEarned = awardShardsForRound();

    state.profile.correctGuesses += 1;
    state.profile.shards += shardsEarned;
    state.run.streak += 1;
    state.profile.bestStreak = Math.max(state.profile.bestStreak, state.run.streak);
    state.profile.bestRound = Math.max(state.profile.bestRound, state.run.round);
    if (state.profile.fastestSolveMs == null || solveMs < state.profile.fastestSolveMs) {
      state.profile.fastestSolveMs = solveMs;
    }
    if (state.run.roundIsAmbiguous) state.profile.solvedAmbiguousCount += 1;

    const i18n = window.I18n;
    validityText.innerHTML = `🎉 ${i18n.t('correctGuess')} +${shardsEarned}◆ &nbsp; (${(solveMs / 1000).toFixed(1)}${i18n.t('solveTime')})`;

    const unlocked = checkAchievements(state.profile);

    updateShardsDisplay();
    updateStatsDisplay();
    persistProfile();
    ANALYTICS.track('guess_correct', { round: state.run.round, attempts: state.run.attemptsThisRound, solveMs, shardsEarned });

    if (unlocked.length) announceAchievements(unlocked);

    if (state.run.round % 5 === 0) AdManager.showInterstitial();

    state.run.isActive = false;

    if (state.mode === 'daily') {
      const dailyResult = recordDailyResult(true, solveMs);
      setTimeout(() => {
        indicator.style.display = 'none';
        showDailyResult(dailyResult, shardsEarned);
      }, 2200);
    } else {
      state.dom.submitBtn.hidden = true;
      state.dom.nextWordBtn.hidden = false;
    }
  }

  function getYesterdayDate() {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() - 1);
    return d.toISOString().split('T')[0];
  }

  function todaysDailyResult(lang) {
    const result = state.profile.dailyResults?.[lang];
    return result && result.date === getCurrentDate() ? result : null;
  }

  function recordDailyResult(solved, solveMs) {
    const today = getCurrentDate();
    const lang = window.I18n.getLanguage();
    const result = {
      date: today,
      word: state.run.dailyWord,
      solved,
      attempts: state.run.attemptsThisRound,
      solveMs: solved ? solveMs : null
    };
    state.profile.dailyResults = { ...state.profile.dailyResults, [lang]: result };

    // The streak counts days, so a second language on the same day leaves it unchanged.
    if (!solved) {
      state.profile.dailyStreak = 0;
    } else if (state.profile.lastDailyPlayDate !== today) {
      state.profile.dailyStreak = state.profile.lastDailyPlayDate === getYesterdayDate()
        ? (state.profile.dailyStreak || 0) + 1
        : 1;
    }
    state.profile.lastDailyPlayDate = today;
    state.profile.dailyBestRound = Math.max(state.profile.dailyBestRound || 0, 1);

    persistProfile();
    renderDailyMenuState();
    return result;
  }

  function showDailyResult(dailyResult, shardsEarned) {
    const i18n = window.I18n;
    const heading = dailyResult.solved ? i18n.t('dailyComplete') : i18n.t('dailyMissed');
    const timeLine = dailyResult.solved
      ? `<div style="color: #666; font-size: 0.9em; margin-bottom: 8px;">${i18n.t('dailyTime')}: ${(dailyResult.solveMs / 1000).toFixed(1)}s</div>`
      : '';
    const shardsLine = shardsEarned
      ? `<div style="color: #667eea; font-size: 1.1em; font-weight: bold;">+${shardsEarned}◆</div>`
      : '';

    const modal = state.dom.result;
    modal.innerHTML = `
      <div style="text-align: center; padding: 40px 20px;">
        <h2 style="color: #667eea; font-size: 2em; margin-bottom: 20px;">${heading}</h2>
        <div style="background: rgba(102, 126, 234, 0.1); border-radius: 12px; padding: 30px; margin-bottom: 20px;">
          <div style="margin-bottom: 20px;">
            <div style="color: #666; font-size: 0.9em; margin-bottom: 8px;">${i18n.t('dailyWord')}: <strong>${dailyResult.word}</strong></div>
            ${timeLine}
            ${shardsLine}
          </div>
          <hr style="border: none; border-top: 1px solid rgba(102, 126, 234, 0.2); margin: 20px 0;">
          <div style="font-size: 0.95em;">
            <div style="margin: 10px 0;">${i18n.t('dailyStreak')}: <strong>${state.profile.dailyStreak}</strong></div>
            <div style="margin: 10px 0;">${i18n.t('attempts')}: <strong>${dailyResult.attempts}</strong></div>
            <div style="margin: 10px 0;">${i18n.t('dailyComeBack')}</div>
          </div>
        </div>
        <button id="dailyBackBtn" style="background: #667eea; color: white; border: none; padding: 12px 30px; border-radius: 8px; font-size: 1em; cursor: pointer;">${i18n.t('backToMenu')}</button>
      </div>
    `;
    modal.className = dailyResult.solved ? 'result correct' : 'result incorrect';

    // Add click handler after DOM is updated
    setTimeout(() => {
      const backBtn = document.getElementById('dailyBackBtn');
      if (backBtn) {
        backBtn.addEventListener('click', () => showLanguageScreen({ allowBackToMenu: true }));
      }
    }, 0);
  }

  function getCurrentDate() {
    return new Date().toISOString().split('T')[0];
  }

  function handleValidButWrongGuess(result, indicator, validityText) {
    AudioFX.incorrect();
    result.classList.add('incorrect');
    indicator.className = 'validity-indicator invalid';
    const i18n = window.I18n;
    validityText.innerHTML = `❌ ${i18n.t('incorrectGuess')} ${i18n.t('wordWas')} ${state.run.currentWord}`;
    state.run.streak = 0;
    state.dom.streakValue.textContent = '0';

    persistProfile();
    ANALYTICS.track('guess_incorrect', { round: state.run.round, guessedValidWord: true });

    state.run.isActive = false;
    if (state.mode === 'daily') {
      const dailyResult = recordDailyResult(false, null);
      setTimeout(() => {
        indicator.style.display = 'none';
        showDailyResult(dailyResult, 0);
      }, 3000);
      return;
    }
    setTimeout(() => {
      state.run.round += 1;
      state.run.isActive = true;
      startNewRound();
      indicator.style.display = 'none';
    }, 3000);
  }

  function handleInvalidGuess(result, indicator, validityText) {
    AudioFX.invalid();
    result.classList.add('invalid');
    indicator.className = 'validity-indicator invalid';
    const i18n = window.I18n;
    validityText.innerHTML = `❌ ${i18n.t('notAWord')}`;
    ANALYTICS.track('guess_incorrect', { round: state.run.round, guessedValidWord: false });
  }

  function showError(message) {
    const result = state.dom.result;
    state.dom.resultText.textContent = message;
    result.className = 'result empty';
    state.dom.validityIndicator.style.display = 'none';
    result.style.animation = 'shake 0.5s';
    setTimeout(() => { result.style.animation = ''; }, 500);
  }

  function clearInput() {
    clearLetterBoxes();
    clearScribble();
    state.dom.resultText.textContent = 'Make your guess to see the result!';
    state.dom.result.className = 'result empty';
    state.dom.validityIndicator.style.display = 'none';
  }

  // ===========================================================================
  // Stat / UI rendering
  // ===========================================================================
  function updateStatsDisplay() {
    state.dom.correctGuesses.textContent = String(state.profile.correctGuesses);
    state.dom.streakValue.textContent = String(state.run.streak);
    state.dom.bestRoundValue.textContent = String(state.profile.bestRound);
    state.dom.lifetimeCorrectValue.textContent = String(state.profile.correctGuesses);
    const unlockedCount = Object.keys(state.profile.achievements).length;
    state.dom.achievementsCountValue.textContent = `${unlockedCount}/${ACHIEVEMENTS.length}`;
  }

  function updateShardsDisplay() {
    state.dom.shardsValue.textContent = String(state.profile.shards);
  }

  function updateUILanguage() {
    const i18n = window.I18n;

    // Update all static labels
    document.documentElement.lang = i18n.getLanguage();
    document.title = i18n.t('pageTitle');
    document.querySelectorAll('[data-i18n]').forEach((el) => {
      el.textContent = i18n.t(el.dataset.i18n);
    });
    renderDailyMenuState();
    state.dom.languageSelect.value = i18n.getLanguage();
    state.dom.themeSelect.value = i18n.getTheme();

    // Update page title and subtitle
    const h1 = document.querySelector('h1');
    if (h1) h1.textContent = i18n.t('title');
    const subtitle = document.querySelector('.subtitle');
    if (subtitle) subtitle.textContent = i18n.t('subtitle');

    // Update button titles for tooltips (keep emoji, update titles only)
    state.dom.rulesBtn.title = i18n.t('howToPlay');
    state.dom.audioToggleBtn.title = i18n.t('audioToggleBtn');
    state.dom.alphabetToggleBtn.title = i18n.t('alphabetToggleBtn');
    state.dom.languageToggleBtn.title = `${i18n.t('language')}: ${i18n.getLanguage().toUpperCase()}`;
    state.dom.themeToggleBtn.title = `${i18n.t('theme')}: ${i18n.t(i18n.getTheme())}`;
    state.dom.achievementsBtn.title = i18n.t('achievements');
    state.dom.storeBtn.title = i18n.t('store');
    state.dom.settingsBtn.title = i18n.t('settings');

    // Update game stats labels
    document.querySelectorAll('.stat-item').forEach((item, i) => {
      const labels = [i18n.t('round'), i18n.t('correct'), i18n.t('attempts'), i18n.t('streak')];
      const labelEl = item.querySelector('div:last-child');
      if (labelEl && labels[i]) labelEl.textContent = labels[i];
    });

    // Update decode sequence label
    const decodeLabel = document.querySelector('.game-info > div:nth-child(2)');
    if (decodeLabel) decodeLabel.textContent = i18n.t('decodeSequence');

    // Update hints section
    const hintText = document.querySelector('.hint-section .hint-text');
    if (hintText) hintText.textContent = i18n.t('hints');

    // Update scribble area
    const scribbleSpan = document.querySelector('.scribble-header > span');
    if (scribbleSpan) scribbleSpan.textContent = i18n.t('scribbleHeader');
    state.dom.scribblePad.placeholder = i18n.t('scribblePlaceholder');

    const clearCanvasBtn = state.dom.clearCanvasBtn;
    if (clearCanvasBtn) clearCanvasBtn.textContent = i18n.t('clearCanvas');

    // Update input label
    const inputLabel = document.querySelector('.input-group > label');
    if (inputLabel) inputLabel.textContent = i18n.t('enterGuess');

    // Update game control buttons
    state.dom.submitBtn.textContent = i18n.t('submitGuess');
    state.dom.nextWordBtn.textContent = i18n.t('nextWord');
    state.dom.newGameBtn.textContent = i18n.t('newGame');
    state.dom.clearBtn.textContent = i18n.t('clear');

    // Update hint button
    const hintCost = state.dom.hintCost.textContent;
    state.dom.hintBtn.innerHTML = `${i18n.t('hint')} (<span id="hintCost">${hintCost}</span>◆)`;

    // Sidebar labels
    const thisSessionEl = document.querySelector('.session-card-title');
    if (thisSessionEl) thisSessionEl.textContent = i18n.t('thisSession');

    // Update session stats labels
    document.querySelectorAll('.session-row').forEach((row) => {
      const span = row.querySelector('span:first-child');
      if (span) {
        const text = span.textContent.trim();
        if (text === 'Best round' || text === 'Meilleure manche') span.textContent = i18n.t('bestRound');
        if (text === 'Total correct' || text === 'Total correct') span.textContent = i18n.t('totalCorrect');
        if (text === 'Achievements' || text === 'Réalisations') span.textContent = i18n.t('achievements');
      }
    });

    const refGuideEl = document.querySelector('.alphabet-reference strong');
    if (refGuideEl) refGuideEl.textContent = i18n.t('referenceGuide');

    // Update modal titles
    document.querySelectorAll('.modal-header h2').forEach((el) => {
      const modal = el.closest('.modal-overlay');
      if (modal?.id === 'rulesModal') el.textContent = i18n.t('howToPlay');
      if (modal?.id === 'storeModal') el.textContent = i18n.t('store');
      if (modal?.id === 'achievementsModal') el.textContent = i18n.t('achievements');
      if (modal?.id === 'settingsModal') el.textContent = i18n.t('settings');
      if (modal?.id === 'aboutModal') el.textContent = i18n.t('about');
    });

    // Update settings modal labels
    document.querySelectorAll('.settings-row').forEach((row) => {
      const span = row.querySelector('span:first-child');
      if (span) {
        const text = span.textContent.trim();
        if (text === 'Sound effects' || text === 'Effets sonores') span.textContent = i18n.t('soundEffects');
        if (text === 'Ink theme' || text === 'Thème d\'encre') span.textContent = i18n.t('inkTheme');
        if (text === 'Ads' || text === 'Publicités') span.textContent = i18n.t('ads');
        if (text === 'Cloud Save' || text === 'Sauvegarde cloud') span.textContent = i18n.t('cloudSave');
        if (text === 'App version' || text === 'Version de l\'application') span.textContent = i18n.t('appVersion');
        if (text === 'Language' || text === 'Langue') span.textContent = i18n.t('language');
        if (text === 'Theme' || text === 'Thème') span.textContent = i18n.t('theme');
      }
    });

    // Update buttons
    const resetBtn = state.dom.resetProgressBtn;
    if (resetBtn) resetBtn.textContent = i18n.t('resetProgress');

    // Update privacy policy links
    document.querySelectorAll('.footer-link').forEach((link) => {
      if (link.textContent.includes('Privacy') || link.textContent.includes('Politique')) {
        link.textContent = i18n.t('privacyPolicy');
      }
    });

    // Update menu translations
    updateMenuTranslations();

    // Re-render some parts that have dynamic text
    renderAlphabetGrid();
  }

  function renderAlphabetGrid() {
    const grid = state.dom.alphabetGrid;
    grid.innerHTML = '';
    for (let i = 0; i < 26; i++) {
      const item = document.createElement('div');
      item.className = 'alphabet-item';
      item.textContent = `${String.fromCharCode(65 + i)}=${i + 1}`;
      grid.appendChild(item);
    }
  }

  function renderStore() {
    const container = state.dom.storeItems;
    container.innerHTML = '';
    MONETIZATION_CATALOG.forEach((item) => {
      const owned = !item.consumable && state.profile.purchases[item.id];
      const row = document.createElement('div');
      row.className = 'store-item';
      row.innerHTML = `
        <div class="store-item-info">
          <div class="store-item-name">${item.name}</div>
          <div class="store-item-desc">${item.desc}</div>
        </div>
        <button class="store-item-buy" ${owned ? 'disabled' : ''}>${owned ? 'Owned' : item.price}</button>
      `;
      row.querySelector('.store-item-buy').addEventListener('click', () => purchase(item.id));
      container.appendChild(row);
    });
  }

  function purchase(id) {
    const item = MONETIZATION_CATALOG.find((i) => i.id === id);
    if (!item) return;
    if (!item.consumable && state.profile.purchases[id]) return;

    state.profile.purchases[id] = (state.profile.purchases[id] || 0) + 1;
    if (item.grantsShards) state.profile.shards += item.grantsShards;
    if (item.grantsAdsFree) state.profile.settings.adsFree = true;
    if (item.grantsTheme) {
      state.profile.purchasedThemes = state.profile.purchasedThemes || [];
      if (!state.profile.purchasedThemes.includes(item.grantsTheme)) state.profile.purchasedThemes.push(item.grantsTheme);
    }

    console.warn(`[IAP] (sandbox) simulated purchase of "${item.id}" for ${item.price} — no real payment was processed. Wire a real store SDK before shipping.`);
    ANALYTICS.track('iap_purchase', { id, price: item.price, sandbox: true });

    updateShardsDisplay();
    updateAdsStatusLabel();
    persistProfile();
    renderStore();
    showToast(`Purchased: ${item.name} (sandbox)`);
  }

  function updateAdsStatusLabel() {
    state.dom.adsStatusLabel.textContent = state.profile.settings.adsFree ? 'Disabled (ad-free)' : 'Enabled';
  }

  function renderAchievements() {
    const container = state.dom.achievementsList;
    container.innerHTML = '';
    ACHIEVEMENTS.forEach((a) => {
      const unlocked = Boolean(state.profile.achievements[a.id]);
      const row = document.createElement('div');
      row.className = `achievement-item${unlocked ? ' unlocked' : ''}`;
      row.innerHTML = `
        <div class="achievement-icon">${a.icon}</div>
        <div>
          <div class="achievement-name">${a.name}</div>
          <div class="achievement-desc">${a.desc}</div>
        </div>
      `;
      container.appendChild(row);
    });
  }

  function announceAchievements(unlocked) {
    unlocked.forEach((a, i) => {
      setTimeout(() => {
        AudioFX.achievement();
        showToast(`\u{1F3C6} Achievement unlocked: ${a.name}`);
        ANALYTICS.track('achievement_unlocked', { id: a.id });
      }, i * 1400);
    });
    renderAchievements();
  }

  // ===========================================================================
  // Modals / settings
  // ===========================================================================
  function openModal(id) {
    state.dom[id].hidden = false;
    if (id === 'storeModal') renderStore();
    if (id === 'achievementsModal') renderAchievements();
  }
  function closeModal(id) { state.dom[id].hidden = true; }

  function applySettingsToUi() {
    state.dom.audioToggleCheckbox.checked = state.profile.settings.audioEnabled;
    state.dom.inkThemeSelect.value = state.profile.settings.inkTheme;
    state.dom.cloudSaveToggle.checked = state.profile.settings.cloudSaveEnabled || false;
    state.dom.audioToggleBtn.textContent = state.profile.settings.audioEnabled ? '\u{1F50A}' : '\u{1F507}';
    state.dom.audioToggleBtn.classList.toggle('muted', !state.profile.settings.audioEnabled);
    state.dom.alphabetReference.hidden = !state.profile.settings.showAlphabet;
    state.dom.alphabetToggleBtn.classList.toggle('muted', !state.profile.settings.showAlphabet);
    state.dom.alphabetToggleBtn.setAttribute('aria-pressed', String(state.profile.settings.showAlphabet));
    document.body.classList.remove('theme-default', 'theme-neon', 'theme-gold');
    document.body.classList.add(`theme-${state.profile.settings.inkTheme}`);
    AudioFX.setEnabled(state.profile.settings.audioEnabled);
    applyInkTheme();
    updateAdsStatusLabel();
  }

  function toggleAudio() {
    state.profile.settings.audioEnabled = !state.profile.settings.audioEnabled;
    applySettingsToUi();
    persistProfile();
    AudioFX.click();
  }

  function toggleAlphabet() {
    state.profile.settings.showAlphabet = !state.profile.settings.showAlphabet;
    applySettingsToUi();
    persistProfile();
    AudioFX.click();
  }

  async function resetAllProgress() {
    const confirmed = window.confirm('Reset ALL progress? This clears shards, achievements, and stats. This cannot be undone.');
    if (!confirmed) return;
    state.profile = defaultProfile();
    state.run.round = 1;
    state.run.streak = 0;
    applySettingsToUi();
    updateShardsDisplay();
    updateStatsDisplay();
    await Persistence.save(state.profile);
    startNewRound();
    closeModal('settingsModal');
    showToast('Progress reset.');
  }

  let saveTimer = null;
  function persistProfile() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => Persistence.save(state.profile), 300);
  }

  // ===========================================================================
  // Game Menu
  // ===========================================================================
  function showLanguageScreen({ allowBackToMenu = false } = {}) {
    state.dom.langScreenMenuBtn.hidden = !allowBackToMenu;
    document.querySelectorAll('[data-daily-lang]').forEach((el) => {
      const played = todaysDailyResult(el.dataset.dailyLang);
      el.textContent = played ? `${played.solved ? '✅' : '❌'} ${played.word}` : '';
    });
    state.dom.languageScreen.classList.remove('hidden');
  }

  function hideLanguageScreen() {
    state.dom.languageScreen.classList.add('hidden');
  }

  function showMenu() {
    renderDailyMenuState();
    state.dom.gameMenu.classList.remove('hidden');
  }

  function renderDailyMenuState() {
    const i18n = window.I18n;
    const played = todaysDailyResult(i18n.getLanguage());
    const btn = state.dom.dailyChallengeBtn;
    btn.disabled = Boolean(played);
    btn.textContent = played
      ? `${played.solved ? '✅' : '❌'} ${i18n.t('dailyWord')}: ${played.word}`
      : `🎯 ${i18n.t('playDaily')}`;
    btn.title = played ? i18n.t('dailyComeBack') : '';
  }

  function hideMenu() {
    state.dom.gameMenu.classList.add('hidden');
  }

  function selectLanguageAndContinue(lang) {
    window.I18n.setLanguage(lang);
    state.dom.languageSelect.value = lang;
    updateUILanguage();
    hideLanguageScreen();
    showMenu();
  }

  function selectDifficulty(difficulty) {
    state.difficulty = difficulty;
    document.querySelectorAll('.difficulty-btn').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.difficulty === difficulty);
    });
  }

  function startGame() {
    hideMenu();
    state.mode = 'casual';
    state.run.round = 1;
    state.run.streak = 0;
    state.run.isActive = true;
    updateStatsDisplay();
    startNewRound();
  }

  async function startDailyChallenge() {
    const played = todaysDailyResult(window.I18n.getLanguage());
    if (played) {
      showToast(`${window.I18n.t('dailyWord')}: ${played.word} — ${window.I18n.t('dailyComeBack')}`);
      return;
    }
    hideMenu();
    state.dom.loadingOverlay.hidden = false;
    state.dom.loadingText.textContent = window.I18n.t('loading') + ' Daily Challenge';

    try {
      const language = window.I18n.getLanguage();
      console.log('Fetching daily challenge for language:', language);

      const word = await SupabaseClient.getDailyChallenge(language);
      console.log('Daily word received:', word);

      if (!word) {
        throw new Error(`No daily challenge word found for ${language}. Did you add it to the database?`);
      }

      state.mode = 'daily';
      state.run.round = 1;
      state.run.streak = 0;
      state.run.isActive = true;
      state.run.dailyWord = word;

      updateStatsDisplay();
      startDailyRound();
    } catch (err) {
      console.error('Daily challenge error:', err.message || err);
      showToast('Daily: ' + (err.message || 'Error loading challenge'));
      state.dom.loadingOverlay.hidden = true;
      showMenu();
    }
  }

  function startDailyRound() {
    showSubmitButton();
    // Override normal word selection with fixed daily word
    state.run.currentWord = state.run.dailyWord;
    const numbers = wordToNumbers(state.run.currentWord);
    state.run.currentNumbers = numbers.join('-');
    state.run.scrambledSequence = scrambleNumbers(numbers);
    state.run.attemptsThisRound = 0;
    state.run.roundStartTime = Date.now();

    const ambiguousMatches = checkForAmbiguity(state.run.scrambledSequence);
    state.run.roundIsAmbiguous = ambiguousMatches.length > 1;
    renderAmbiguity(ambiguousMatches);

    const i18n = window.I18n;
    state.dom.challengeNumbers.textContent = state.run.scrambledSequence;
    state.dom.wordLengthHint.textContent = i18n.t('wordLength').replace('?', state.run.currentWord.length);
    state.dom.difficultyHint.textContent = `Daily Challenge`;
    state.dom.currentRound.textContent = '🎯';
    state.dom.streakValue.textContent = '—';

    createLetterBoxes(state.run.currentWord.length);

    state.dom.resultText.textContent = i18n.t('makeGuess');
    state.dom.result.className = 'result empty';
    state.dom.validityIndicator.style.display = 'none';
    state.dom.hintBtn.disabled = true;
    state.dom.newGameBtn.hidden = false;
    state.dom.clearBtn.hidden = false;
    clearInput();
    state.dom.loadingOverlay.hidden = true;
  }

  function getTierForRound(round) {
    const baseTiers = CONSTANTS.DIFFICULTY_TIERS;

    if (state.difficulty === 'easy') {
      const easyTiers = baseTiers.slice(0, 10);
      return easyTiers[Math.min(round - 1, easyTiers.length - 1)];
    } else if (state.difficulty === 'hard') {
      const hardTiers = baseTiers.slice(2);
      return hardTiers[Math.min(round - 1, hardTiers.length - 1)];
    } else {
      return baseTiers[Math.min(round - 1, baseTiers.length - 1)];
    }
  }

  function updateMenuTranslations() {
    const i18n = window.I18n;
    document.getElementById('selectDifficultyTitle').textContent = i18n.t('selectDifficulty');
    document.getElementById('selectLanguageTitle').textContent = i18n.t('selectLanguage');
    state.dom.langScreenMenuBtn.textContent = i18n.t('backToMenu');

    const playBtn = state.dom.playBtn;
    if (playBtn) playBtn.textContent = i18n.t('play');

    document.querySelectorAll('.difficulty-btn').forEach((btn) => {
      const difficulty = btn.dataset.difficulty;
      const nameEl = btn.querySelector('.difficulty-name');
      const descEl = btn.querySelector('.difficulty-desc');

      if (difficulty === 'easy') {
        if (nameEl) nameEl.textContent = i18n.t('easy');
        if (descEl) descEl.textContent = i18n.t('easyDesc');
      } else if (difficulty === 'medium') {
        if (nameEl) nameEl.textContent = i18n.t('medium');
        if (descEl) descEl.textContent = i18n.t('mediumDesc');
      } else if (difficulty === 'hard') {
        if (nameEl) nameEl.textContent = i18n.t('hard');
        if (descEl) descEl.textContent = i18n.t('hardDesc');
      }
    });
  }

  // ===========================================================================
  // Wiring
  // ===========================================================================
  function wireEvents() {
    state.dom.submitBtn.addEventListener('click', submitGuess);
    state.dom.nextWordBtn.addEventListener('click', goToNextWord);
    state.dom.newGameBtn.addEventListener('click', newGame);
    state.dom.clearBtn.addEventListener('click', clearInput);
    state.dom.hintBtn.addEventListener('click', useHint);
    state.dom.clearCanvasBtn.addEventListener('click', clearScribble);

    // Language screen buttons
    state.dom.enLangBtn.addEventListener('click', () => selectLanguageAndContinue('en'));
    state.dom.frLangBtn.addEventListener('click', () => selectLanguageAndContinue('fr'));

    // Menu buttons
    state.dom.easyBtn.addEventListener('click', () => selectDifficulty('easy'));
    state.dom.mediumBtn.addEventListener('click', () => selectDifficulty('medium'));
    state.dom.hardBtn.addEventListener('click', () => selectDifficulty('hard'));
    state.dom.playBtn.addEventListener('click', startGame);
    state.dom.dailyChallengeBtn.addEventListener('click', startDailyChallenge);
    state.dom.langScreenMenuBtn.addEventListener('click', () => {
      hideLanguageScreen();
      showMenu();
    });
    state.dom.menuSettingsBtn.addEventListener('click', () => {
      hideMenu();
      openModal('settingsModal');
    });

    state.dom.rulesBtn.addEventListener('click', () => openModal('rulesModal'));
    state.dom.achievementsBtn.addEventListener('click', () => openModal('achievementsModal'));
    state.dom.storeBtn.addEventListener('click', () => openModal('storeModal'));
    state.dom.settingsBtn.addEventListener('click', () => openModal('settingsModal'));
    state.dom.audioToggleBtn.addEventListener('click', toggleAudio);
    state.dom.alphabetToggleBtn.addEventListener('click', toggleAlphabet);

    document.querySelectorAll('[data-close-modal]').forEach((btn) => {
      btn.addEventListener('click', () => closeModal(btn.dataset.closeModal));
    });
    document.querySelectorAll('.modal-overlay').forEach((overlay) => {
      overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.hidden = true; });
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') document.querySelectorAll('.modal-overlay').forEach((m) => { m.hidden = true; });
    });

    state.dom.audioToggleCheckbox.addEventListener('change', () => {
      state.profile.settings.audioEnabled = state.dom.audioToggleCheckbox.checked;
      applySettingsToUi();
      persistProfile();
    });
    state.dom.inkThemeSelect.addEventListener('change', () => {
      state.profile.settings.inkTheme = state.dom.inkThemeSelect.value;
      applySettingsToUi();
      persistProfile();
    });

    state.dom.cloudSaveToggle.addEventListener('change', async () => {
      const enabled = state.dom.cloudSaveToggle.checked;
      state.profile.settings.cloudSaveEnabled = enabled;
      if (enabled && typeof window.SupabaseClient !== 'undefined') {
        try {
          await window.SupabaseClient.signInAnonymously();
          // Sync current profile to cloud
          await persistProfile();
          showToast('Cloud save enabled!');
        } catch (err) {
          console.error('Cloud sign-in failed:', err);
          state.dom.cloudSaveToggle.checked = false;
          state.profile.settings.cloudSaveEnabled = false;
          showToast('Cloud save failed. Try again later.');
        }
      } else {
        persistProfile();
      }
    });

    // Language and theme toggle in settings modal
    state.dom.languageSelect.addEventListener('change', () => {
      window.I18n.setLanguage(state.dom.languageSelect.value);
      updateUILanguage();
    });
    state.dom.themeSelect.addEventListener('change', () => {
      window.I18n.setTheme(state.dom.themeSelect.value);
    });

    // Language and theme toggle buttons in top bar
    state.dom.languageToggleBtn.addEventListener('click', () => {
      const current = window.I18n.getLanguage();
      const next = current === 'en' ? 'fr' : 'en';
      window.I18n.setLanguage(next);
      state.dom.languageSelect.value = next;
      updateUILanguage();
    });
    state.dom.themeToggleBtn.addEventListener('click', () => {
      const current = window.I18n.getTheme();
      const next = current === 'light' ? 'dark' : 'light';
      window.I18n.setTheme(next);
      state.dom.themeSelect.value = next;
      updateUILanguage();
    });

    state.dom.resetProgressBtn.addEventListener('click', resetAllProgress);

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.target.matches('button, .letter-box, .scribble-pad')) submitGuess();
    });

    window.addEventListener('beforeunload', () => { Persistence.save(state.profile); });

    if (window.electronAPI) {
      window.electronAPI.onNewGame(() => newGame());
      window.electronAPI.onAbout(() => openModal('aboutModal'));
    }
  }

  // ===========================================================================
  // Boot
  // ===========================================================================
  async function boot() {
    cacheDom();
    state.dom.hintCost.textContent = String(CONFIG.hintCostShards);
    renderAlphabetGrid();
    wireEvents();

    const savedProfile = await Persistence.load();
    if (savedProfile) state.profile = Object.assign(defaultProfile(), savedProfile, { settings: Object.assign(defaultProfile().settings, savedProfile.settings || {}) });
    applySettingsToUi();
    updateShardsDisplay();
    updateStatsDisplay();

    let envAnalyticsEnabled = false;
    let version = '1.0.0 (web)';
    if (window.electronAPI) {
      const env = await window.electronAPI.getEnv();
      envAnalyticsEnabled = env.ANALYTICS_ENABLED;
      version = await window.electronAPI.getVersion();
    }
    ANALYTICS.configure({ enabled: envAnalyticsEnabled, debug: !envAnalyticsEnabled });
    state.dom.appVersionLabel.textContent = version;
    state.dom.aboutVersionLabel.textContent = version;
    state.dom.footerVersion.textContent = `v${version.replace(/^v/, '')}`;

    await WORDSDB.init();

    state.dom.loadingOverlay.hidden = true;
    updateUILanguage();
    showLanguageScreen();
    selectDifficulty('medium');
    ANALYTICS.track('game_start', { version, wordCount: WORDSDB.wordCount() });

    if (!state.profile.hasSeenRules) {
      state.profile.hasSeenRules = true;
      persistProfile();
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    boot().catch((err) => {
      console.error('Failed to start CodeBreaker:', err);
      const loadingText = q('loadingText');
      if (loadingText) loadingText.textContent = `Failed to load: ${err.message}`;
    });
  });
})();
