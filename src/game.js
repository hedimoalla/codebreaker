/**
 * game.js — CodeBreaker game logic: cipher mechanics, canvas, audio,
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
      achievements: {},
      purchases: {},
      settings: { audioEnabled: true, inkTheme: 'default', adsFree: false }
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
    dom: {},
    canvas: { ctx: null, drawing: false }
  };

  function q(id) { return document.getElementById(id); }

  function cacheDom() {
    const ids = [
      'currentRound', 'correctGuesses', 'totalAttempts', 'streakValue',
      'challengeNumbers', 'wordLengthHint', 'difficultyHint',
      'scribbleCanvas', 'clearCanvasBtn', 'ambiguityWarning', 'parsingOptions',
      'letterContainer', 'submitBtn', 'hintBtn', 'hintCost', 'newGameBtn', 'clearBtn',
      'result', 'resultText', 'validityIndicator', 'validityText',
      'shardsValue', 'audioToggleBtn', 'achievementsBtn', 'storeBtn', 'settingsBtn',
      'bestRoundValue', 'lifetimeCorrectValue', 'achievementsCountValue', 'alphabetGrid',
      'storeModal', 'storeItems', 'achievementsModal', 'achievementsList',
      'settingsModal', 'audioToggleCheckbox', 'inkThemeSelect', 'adsStatusLabel',
      'appVersionLabel', 'aboutVersionLabel', 'aboutModal', 'resetProgressBtn',
      'toast', 'loadingOverlay', 'loadingText', 'footerVersion'
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
  // Canvas (scribble area)
  // ===========================================================================
  function initCanvas() {
    const canvas = state.dom.scribbleCanvas;
    const ctx = canvas.getContext('2d');
    state.canvas.ctx = ctx;

    function resize() {
      const rect = canvas.getBoundingClientRect();
      const prevData = canvas.width ? ctx.getImageData(0, 0, canvas.width, canvas.height) : null;
      canvas.width = rect.width;
      canvas.height = rect.height;
      applyInkTheme();
      if (prevData) ctx.putImageData(prevData, 0, 0);
    }
    resize();
    window.addEventListener('resize', resize);

    const getPos = (e) => {
      const rect = canvas.getBoundingClientRect();
      return { x: e.clientX - rect.left, y: e.clientY - rect.top };
    };

    canvas.addEventListener('mousedown', (e) => {
      state.canvas.drawing = true;
      const { x, y } = getPos(e);
      ctx.beginPath();
      ctx.moveTo(x, y);
    });
    canvas.addEventListener('mousemove', (e) => {
      if (!state.canvas.drawing) return;
      const { x, y } = getPos(e);
      ctx.lineTo(x, y);
      ctx.stroke();
    });
    ['mouseup', 'mouseout'].forEach((evt) => canvas.addEventListener(evt, () => { state.canvas.drawing = false; }));

    canvas.addEventListener('touchstart', (e) => { e.preventDefault(); canvas.dispatchEvent(toMouseEvent('mousedown', e)); }, { passive: false });
    canvas.addEventListener('touchmove', (e) => { e.preventDefault(); canvas.dispatchEvent(toMouseEvent('mousemove', e)); }, { passive: false });
    canvas.addEventListener('touchend', (e) => { e.preventDefault(); state.canvas.drawing = false; }, { passive: false });

    function toMouseEvent(type, touchEvent) {
      const touch = touchEvent.touches[0] || touchEvent.changedTouches[0];
      return new MouseEvent(type, { clientX: touch.clientX, clientY: touch.clientY });
    }
  }

  function clearCanvas() {
    const canvas = state.dom.scribbleCanvas;
    const ctx = state.canvas.ctx;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  }

  function applyInkTheme() {
    const ctx = state.canvas.ctx;
    if (!ctx) return;
    ctx.strokeStyle = THEME_COLORS[state.profile.settings.inkTheme] || THEME_COLORS.default;
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
  }

  // ===========================================================================
  // Letter boxes
  // ===========================================================================
  function createLetterBoxes(wordLength) {
    const container = state.dom.letterContainer;
    container.innerHTML = '';

    const tier = CONSTANTS.tierForRound(state.run.round);
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
  function startNewRound() {
    state.run.currentWord = WORDSDB.randomWordForRound(state.run.round);
    const numbers = wordToNumbers(state.run.currentWord);
    state.run.currentNumbers = numbers.join('-');
    state.run.scrambledSequence = scrambleNumbers(numbers);
    state.run.attemptsThisRound = 0;
    state.run.roundStartTime = Date.now();

    const ambiguousMatches = checkForAmbiguity(state.run.scrambledSequence);
    state.run.roundIsAmbiguous = ambiguousMatches.length > 1;
    renderAmbiguity(ambiguousMatches);

    const tier = CONSTANTS.tierForRound(state.run.round);
    state.dom.challengeNumbers.textContent = state.run.scrambledSequence;
    state.dom.wordLengthHint.textContent = `Word length: ${state.run.currentWord.length} letters`;
    state.dom.difficultyHint.textContent = `Difficulty: ${tier.label} (Round ${state.run.round})`;
    state.dom.currentRound.textContent = String(state.run.round);
    state.dom.streakValue.textContent = String(state.run.streak);

    createLetterBoxes(state.run.currentWord.length);

    state.dom.resultText.textContent = 'Make your guess to see the result!';
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
    state.run.round = 1;
    state.run.streak = 0;
    state.dom.streakValue.textContent = '0';
    startNewRound();
    AudioFX.click();
  }

  function submitGuess() {
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

    clearCanvas();

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

    validityText.innerHTML = `\u{1F389} CORRECT! +${shardsEarned}◆ &nbsp; (${(solveMs / 1000).toFixed(1)}s)`;

    const unlocked = checkAchievements(state.profile);

    updateShardsDisplay();
    updateStatsDisplay();
    persistProfile();
    ANALYTICS.track('guess_correct', { round: state.run.round, attempts: state.run.attemptsThisRound, solveMs, shardsEarned });

    if (unlocked.length) announceAchievements(unlocked);

    if (state.run.round % 5 === 0) AdManager.showInterstitial();

    state.run.isActive = false;
    setTimeout(() => {
      state.run.round += 1;
      state.run.isActive = true;
      startNewRound();
      indicator.style.display = 'none';
    }, 2200);
  }

  function handleValidButWrongGuess(result, indicator, validityText) {
    AudioFX.incorrect();
    result.classList.add('incorrect');
    indicator.className = 'validity-indicator invalid';
    validityText.innerHTML = `❌ Valid word, but not the answer! The word was: ${state.run.currentWord}`;
    state.run.streak = 0;
    state.dom.streakValue.textContent = '0';

    persistProfile();
    ANALYTICS.track('guess_incorrect', { round: state.run.round, guessedValidWord: true });

    state.run.isActive = false;
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
    validityText.innerHTML = '❌ Not a valid word! Try again.';
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
    clearCanvas();
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
    state.dom.audioToggleBtn.textContent = state.profile.settings.audioEnabled ? '\u{1F50A}' : '\u{1F507}';
    state.dom.audioToggleBtn.classList.toggle('muted', !state.profile.settings.audioEnabled);
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
  // Wiring
  // ===========================================================================
  function wireEvents() {
    state.dom.submitBtn.addEventListener('click', submitGuess);
    state.dom.newGameBtn.addEventListener('click', newGame);
    state.dom.clearBtn.addEventListener('click', clearInput);
    state.dom.hintBtn.addEventListener('click', useHint);
    state.dom.clearCanvasBtn.addEventListener('click', clearCanvas);

    state.dom.achievementsBtn.addEventListener('click', () => openModal('achievementsModal'));
    state.dom.storeBtn.addEventListener('click', () => openModal('storeModal'));
    state.dom.settingsBtn.addEventListener('click', () => openModal('settingsModal'));
    state.dom.audioToggleBtn.addEventListener('click', toggleAudio);

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
    state.dom.resetProgressBtn.addEventListener('click', resetAllProgress);

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.target.matches('.letter-box')) submitGuess();
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
    initCanvas();

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
    startNewRound();
    ANALYTICS.track('game_start', { version, wordCount: WORDSDB.wordCount() });
  }

  document.addEventListener('DOMContentLoaded', () => {
    boot().catch((err) => {
      console.error('Failed to start CodeBreaker:', err);
      const loadingText = q('loadingText');
      if (loadingText) loadingText.textContent = `Failed to load: ${err.message}`;
    });
  });
})();
