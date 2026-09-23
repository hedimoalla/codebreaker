/**
 * i18n.js — Internationalization (EN/FR) and theme (light/dark) management
 */
(function () {
  'use strict';

  const translations = {
    en: {
      // Page title and subtitle
      pageTitle: 'CodeBreaker - Word Puzzle Game',
      title: 'CodeBreaker',
      subtitle: 'Crack the number sequence to reveal the hidden word',

      // Top bar
      shardsPillTitle: 'Shards — earn by solving, spend on hints',
      rulesBtn: 'How to Play',
      audioToggleBtn: 'Toggle sound',
      alphabetToggleBtn: 'Show/hide letter chart (A=1 … Z=26)',
      playDaily: 'Play Daily',
      dailyWord: "Today's word",
      dailyComplete: '🎯 Daily Challenge Complete!',
      dailyMissed: 'Daily Challenge Over',
      dailyTime: 'Time',
      dailyStreak: 'Current Streak',
      dailyComeBack: 'Come back tomorrow for a new word!',
      backToMenu: 'Back to Menu',
      achievementsBtn: 'Achievements',
      storeBtn: 'Store',
      settingsBtn: 'Settings',

      // Game stats
      round: 'Round',
      correct: 'Correct',
      attempts: 'Attempts',
      streak: 'Streak',

      // Game challenge
      decodeSequence: 'Decode this scrambled number sequence:',
      loading: 'Loading',

      // Hints
      hints: 'Hints:',
      wordLength: 'Word length: ? letters',
      difficulty: 'Difficulty: —',

      // Scribble area
      scribbleHeader: '✏️ Scribble Area - Draft your solution',
      clearCanvas: 'Clear',
      scribblePlaceholder: 'Type your notes here, e.g. 3 1 11 5 = C A K E',

      // Ambiguity warning
      ambiguityWarning: '⚠️ Multiple interpretations possible! Here\'s how the digits could be parsed:',

      // Input
      enterGuess: 'Enter your guess (one letter per box):',

      // Controls
      submitGuess: 'Submit Guess',
      nextWord: 'Next Word ➜',
      hint: 'Hint',
      newGame: 'New Game',
      clear: 'Clear',

      // Result
      makeGuess: 'Make your guess to see the result!',
      checking: 'Checking your guess',

      // Sidebar
      thisSession: 'This Session',
      bestRound: 'Best round',
      totalCorrect: 'Total correct',
      achievements: 'Achievements',
      referenceGuide: 'Reference Guide:',

      // How to Play modal
      howToPlay: 'How to Play',
      rule1Title: '1. The cipher.',
      rule1Text: 'Every letter has a number: A=1, B=2, ... Z=26 (tap 🔤 at the top to show or hide the Reference Guide chart).',
      rule2Title: '2. The challenge.',
      rule2Text: 'The secret word gets converted to numbers, those numbers are shuffled into a random order, and then joined into one long digit string with no separators. That\'s what you see in the box at the top. Your job: figure out which digits belong together, and unscramble them into a real word.',
      rule3Title: '3. The red cumulative-sum boxes — read this one carefully.',
      rule3Text: 'The small red numbers under some letter boxes are not a single letter\'s value. They\'re a running total of the answer\'s letter-values, added up left to right. That\'s why they climb well past 26 — they\'re a sum of several letters, not one. Use them to check whether you\'ve split the digits correctly so far. Example, for the word CAKE (C=3, A=1, K=11, E=5):',
      rule3Example: '3, then 3+1=4, then 4+11=15, then 15+5=20 — each box shows the total so far, not just that one letter.',
      rule4Title: '4. Multiple interpretations.',
      rule4Text: 'Sometimes the scrambled digits can also be split into a completely different real word by coincidence. When that happens, you\'ll see a warning listing the alternate reading(s) — just for awareness, it doesn\'t change your target.',
      rule5Title: '5. Scribble area.',
      rule5Text: 'A text box to type out your working, like how you split the digits and which letters they give. It\'s purely for your own notes: it stays put after a wrong guess and clears when you move on to the next word.',
      rule6Title: '6. Hints.',
      rule6Text: 'Spend Shards to instantly reveal one letter. Shards are earned by solving puzzles — more for solving on your first try, and a bonus if the round had a multiple-interpretation warning.',
      rule7Title: '7. Difficulty.',
      rule7Text: 'Word length increases as your round number climbs, and fewer cumulative-sum checkpoints are shown at higher difficulty.',

      // Store modal
      store: 'Store',
      sandboxBadge: 'Sandbox — simulated purchases',
      buy: 'Buy',

      // Settings modal
      settings: 'Settings',
      soundEffects: 'Sound effects',
      inkTheme: 'Ink theme',
      defaultPurple: 'Default (Purple)',
      neonGreen: 'Neon Green',
      gold: 'Gold',
      ads: 'Ads',
      enabled: 'Enabled',
      cloudSave: 'Cloud Save',
      appVersion: 'App version',
      resetProgress: 'Reset All Progress',
      privacyPolicy: 'Privacy Policy',
      language: 'Language',
      theme: 'Theme',
      light: 'Light',
      dark: 'Dark',

      // About modal
      about: 'About CodeBreaker',
      aboutText: 'CodeBreaker — crack scrambled A=1..Z=26 number ciphers to reveal hidden words.',
      version: 'Version',

      // Toast and notifications
      correctGuess: 'Correct!',
      incorrectGuess: 'Not quite. Try again!',
      notAWord: 'Not a valid word. Try again!',
      hintRevealed: 'Letter revealed!',
      notEnoughShards: 'Not enough Shards!',
      newGameStarted: 'New game started!',
      progressReset: 'Progress reset!',
      gameWon: 'You solved it!',
      solveTime: 's',
      shardsEarned: 'Shards earned',
      wordWas: 'The word was:',
      purchasedSandbox: 'Purchased: ',

      // Achievements
      firstWord: 'First Word',
      tenWords: 'First 10',
      fiftyWords: 'Milestone 50',
      streakFive: 'On Fire',
      streakTen: 'Unstoppable',
      perfectRound: 'Perfect',
      multiInterpretation: 'Decoder',
      noHints: 'No Hints Used',
      master: 'Master',

      // Menu
      selectLanguage: 'Select Language',
      selectDifficulty: 'Select Difficulty',
      dailyChallenge: 'Daily Challenge',
      easy: 'Easy',
      easyDesc: 'Short words, gentle progression',
      medium: 'Medium',
      mediumDesc: 'Balanced challenge',
      hard: 'Hard',
      hardDesc: 'Long words, fast progression',
      play: 'Play',
      rulesTitle: 'How to Play',
      rule1: '1. The cipher:',
      rule1Desc: 'Every letter has a number: A=1, B=2, ... Z=26',
      rule2: '2. The challenge:',
      rule2Desc: 'Unscramble the shuffled digits into a real word.',
      rule3: '3. Red cumulative-sum boxes:',
      rule3Desc: 'Running totals of letter-values added left to right. Use them to verify your splits.',
      rule4: '4. Multiple interpretations:',
      rule4Desc: 'Sometimes digits can form different words. You will see warnings.',
      rule5: '5. Scribble area:',
      rule5Desc: 'Scratch space for your notes.',
      rule6: '6. Hints:',
      rule6Desc: 'Spend Shards to reveal letters. Shards earned by solving puzzles.',
      rule7: '7. Difficulty:',
      rule7Desc: 'Words get longer and checkpoints fewer as you progress.',

      // Footer
      footerVersion: 'v1.0.0',
    },
    fr: {
      // Page title and subtitle
      pageTitle: 'CodeBreaker - Jeu de puzzle de mots',
      title: 'CodeBreaker',
      subtitle: 'Décode la séquence de nombres pour révéler le mot caché',

      // Top bar
      shardsPillTitle: 'Fragments — gagnez en résolvant, dépensez pour des indices',
      rulesBtn: 'Comment jouer',
      audioToggleBtn: 'Activer le son',
      alphabetToggleBtn: 'Afficher/masquer le tableau des lettres (A=1 … Z=26)',
      playDaily: 'Jouer au défi du jour',
      dailyWord: 'Mot du jour',
      dailyComplete: '🎯 Défi du jour réussi !',
      dailyMissed: 'Défi du jour terminé',
      dailyTime: 'Temps',
      dailyStreak: 'Série actuelle',
      dailyComeBack: 'Revenez demain pour un nouveau mot !',
      backToMenu: 'Retour au menu',
      achievementsBtn: 'Réalisations',
      storeBtn: 'Boutique',
      settingsBtn: 'Paramètres',

      // Game stats
      round: 'Manche',
      correct: 'Correct',
      attempts: 'Tentatives',
      streak: 'Série',

      // Game challenge
      decodeSequence: 'Décode cette séquence de nombres brouillée:',
      loading: 'Chargement',

      // Hints
      hints: 'Indices:',
      wordLength: 'Longueur du mot: ? lettres',
      difficulty: 'Difficulté: —',

      // Scribble area
      scribbleHeader: '✏️ Zone de brouillon - Préparez votre solution',
      clearCanvas: 'Effacer',
      scribblePlaceholder: 'Tapez vos notes ici, ex. 3 1 11 5 = C A K E',

      // Ambiguity warning
      ambiguityWarning: '⚠️ Plusieurs interprétations possibles! Voici comment les chiffres pourraient être analysés:',

      // Input
      enterGuess: 'Entrez votre réponse (une lettre par case):',

      // Controls
      submitGuess: 'Soumettre',
      nextWord: 'Mot suivant ➜',
      hint: 'Indice',
      newGame: 'Nouvelle partie',
      clear: 'Effacer',

      // Result
      makeGuess: 'Faites une supposition pour voir le résultat!',
      checking: 'Vérification de votre réponse',

      // Sidebar
      thisSession: 'Cette session',
      bestRound: 'Meilleure manche',
      totalCorrect: 'Total correct',
      achievements: 'Réalisations',
      referenceGuide: 'Guide de référence:',

      // How to Play modal
      howToPlay: 'Comment jouer',
      rule1Title: '1. Le chiffre.',
      rule1Text: 'Chaque lettre a un numéro: A=1, B=2, ... Z=26 (touchez 🔤 en haut pour afficher ou masquer le guide de référence).',
      rule2Title: '2. Le défi.',
      rule2Text: 'Le mot secret est converti en nombres, ces nombres sont mélangés dans un ordre aléatoire, puis joints en une longue chaîne de chiffres sans séparateurs. C\'est ce que vous voyez dans la case en haut. Votre travail: comprendre quels chiffres vont ensemble et les brouiller dans un vrai mot.',
      rule3Title: '3. Les cases rouges de somme cumulative — lisez attentivement.',
      rule3Text: 'Les petits chiffres rouges sous certaines cases de lettres ne sont pas la valeur d\'une seule lettre. C\'est un total cumulatif des valeurs des lettres de la réponse, ajoutées de gauche à droite. C\'est pourquoi ils montent bien au-delà de 26 — c\'est la somme de plusieurs lettres, pas une. Utilisez-les pour vérifier si vous avez bien divisé les chiffres jusqu\'à présent. Par exemple, pour le mot CAKE (C=3, A=1, K=11, E=5):',
      rule3Example: '3, puis 3+1=4, puis 4+11=15, puis 15+5=20 — chaque case montre le total jusqu\'à présent, pas juste cette lettre.',
      rule4Title: '4. Interprétations multiples.',
      rule4Text: 'Parfois, les chiffres brouillés peuvent également être divisés en un mot réel complètement différent par coïncidence. Quand cela se produit, vous verrez un avertissement répertoriant les lectures alternatives — juste pour votre connaissance, cela ne change pas votre cible.',
      rule5Title: '5. Zone de brouillon.',
      rule5Text: 'Une zone de texte pour taper votre raisonnement, par exemple comment vous découpez les chiffres et les lettres obtenues. C\'est uniquement pour vos propres notes : elle reste en place après une mauvaise réponse et s\'efface quand vous passez au mot suivant.',
      rule6Title: '6. Indices.',
      rule6Text: 'Dépensez des fragments pour révéler instantanément une lettre. Les fragments sont gagnés en résolvant des énigmes — plus pour résoudre au premier essai, et un bonus si la manche avait un avertissement d\'interprétations multiples.',
      rule7Title: '7. Difficulté.',
      rule7Text: 'La longueur du mot augmente à mesure que votre numéro de manche augmente, et moins de points de contrôle de somme cumulative sont affichés à une difficulté plus élevée.',

      // Store modal
      store: 'Boutique',
      sandboxBadge: 'Bac à sable — achats simulés',
      buy: 'Acheter',

      // Settings modal
      settings: 'Paramètres',
      soundEffects: 'Effets sonores',
      inkTheme: 'Thème d\'encre',
      defaultPurple: 'Défaut (Violet)',
      neonGreen: 'Vert néon',
      gold: 'Or',
      ads: 'Publicités',
      enabled: 'Activé',
      cloudSave: 'Sauvegarde cloud',
      appVersion: 'Version de l\'application',
      resetProgress: 'Réinitialiser la progression',
      privacyPolicy: 'Politique de confidentialité',
      language: 'Langue',
      theme: 'Thème',
      light: 'Clair',
      dark: 'Sombre',

      // About modal
      about: 'À propos de CodeBreaker',
      aboutText: 'CodeBreaker — décode les chiffrements de nombres brouillés A=1..Z=26 pour révéler les mots cachés.',
      version: 'Version',

      // Toast and notifications
      correctGuess: 'Correct!',
      incorrectGuess: 'Pas tout à fait. Réessayez!',
      notAWord: 'Pas un mot valide. Réessayez!',
      hintRevealed: 'Lettre révélée!',
      notEnoughShards: 'Pas assez de fragments!',
      newGameStarted: 'Nouvelle partie commencée!',
      progressReset: 'Progression réinitialisée!',
      gameWon: 'Vous l\'avez résolu!',
      solveTime: 's',
      shardsEarned: 'Fragments gagnés',
      wordWas: 'Le mot était:',
      purchasedSandbox: 'Acheté: ',

      // Achievements
      firstWord: 'Premier mot',
      tenWords: 'Premiers 10',
      fiftyWords: 'Jalon 50',
      streakFive: 'En feu',
      streakTen: 'Inarrêtable',
      perfectRound: 'Parfait',
      multiInterpretation: 'Décodeur',
      noHints: 'Aucun indice utilisé',
      master: 'Maître',

      // Menu
      selectLanguage: 'Sélectionnez la langue',
      selectDifficulty: 'Sélectionnez la difficulté',
      dailyChallenge: 'Défi quotidien',
      easy: 'Facile',
      easyDesc: 'Mots courts, progression douce',
      medium: 'Moyen',
      mediumDesc: 'Défi équilibré',
      hard: 'Difficile',
      hardDesc: 'Mots longs, progression rapide',
      play: 'Jouer',
      rulesTitle: 'Comment jouer',
      rule1: '1. Le chiffre:',
      rule1Desc: 'Chaque lettre a un numéro: A=1, B=2, ... Z=26',
      rule2: '2. Le défi:',
      rule2Desc: 'Débrouiller les chiffres mélangés en un vrai mot.',
      rule3: '3. Cases rouges de somme cumulative:',
      rule3Desc: 'Totaux courants des valeurs de lettres additionnées de gauche à droite. Utilisez-les pour vérifier vos divisions.',
      rule4: '4. Interprétations multiples:',
      rule4Desc: 'Parfois, les chiffres peuvent former différents mots. Vous verrez des avertissements.',
      rule5: '5. Zone de brouillon:',
      rule5Desc: 'Espace de travail pour vos notes.',
      rule6: '6. Indices:',
      rule6Desc: 'Dépensez des fragments pour révéler des lettres. Les fragments sont gagnés en résolvant des énigmes.',
      rule7: '7. Difficulté:',
      rule7Desc: 'Les mots deviennent plus longs et les points de contrôle moins nombreux à mesure que vous progressez.',

      // Footer
      footerVersion: 'v1.0.0',
    }
  };

  class I18n {
    constructor() {
      this.currentLanguage = localStorage.getItem('language') || 'en';
      this.currentTheme = localStorage.getItem('theme') || 'light';
      this.applyTheme();
    }

    t(key) {
      return translations[this.currentLanguage][key] || translations['en'][key] || key;
    }

    setLanguage(lang) {
      if (translations[lang]) {
        this.currentLanguage = lang;
        localStorage.setItem('language', lang);
        return true;
      }
      return false;
    }

    getLanguage() {
      return this.currentLanguage;
    }

    setTheme(theme) {
      if (['light', 'dark'].includes(theme)) {
        this.currentTheme = theme;
        localStorage.setItem('theme', theme);
        this.applyTheme();
        return true;
      }
      return false;
    }

    getTheme() {
      return this.currentTheme;
    }

    applyTheme() {
      const root = document.documentElement;
      if (this.currentTheme === 'dark') {
        root.style.colorScheme = 'dark';
        root.classList.add('dark-mode');
        root.classList.remove('light-mode');
      } else {
        root.style.colorScheme = 'light';
        root.classList.add('light-mode');
        root.classList.remove('dark-mode');
      }
    }

    getAvailableLanguages() {
      return Object.keys(translations);
    }

    getAvailableThemes() {
      return ['light', 'dark'];
    }
  }

  window.I18n = new I18n();
})();
