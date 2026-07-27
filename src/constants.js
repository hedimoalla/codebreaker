/**
 * constants.js — tunable game config + difficulty tiers.
 *
 * The word list itself lives in a real database file (src/data/words.sqlite,
 * queried at runtime by src/words-db.js) rather than being hardcoded here —
 * see data/words-source.json for the editable source and README.md's
 * "Word list" section for how to swap in a licensed NASPA/OWL2023 list.
 */
(function (root) {
  /** Difficulty tiers keyed by round number ranges. */
  const DIFFICULTY_TIERS = [
    { minRound: 1, maxRound: 3, lengths: [4], sumHints: 3, label: 'Easy' },
    { minRound: 4, maxRound: 6, lengths: [5], sumHints: 2, label: 'Medium' },
    { minRound: 7, maxRound: 9, lengths: [6], sumHints: 2, label: 'Hard' },
    { minRound: 10, maxRound: 12, lengths: [7], sumHints: 1, label: 'Expert' },
    { minRound: 13, maxRound: 15, lengths: [8], sumHints: 1, label: 'Master' },
    { minRound: 16, maxRound: Infinity, lengths: [9, 10, 11], sumHints: 1, label: 'Grandmaster' }
  ];

  function tierForRound(round) {
    return DIFFICULTY_TIERS.find((t) => round >= t.minRound && round <= t.maxRound) || DIFFICULTY_TIERS[DIFFICULTY_TIERS.length - 1];
  }

  const CONFIG = {
    startingShards: 50,
    shardsPerCorrect: 10,
    shardsBonusNoMistakes: 5,
    shardsBonusAmbiguousSolve: 5,
    hintCostShards: 15,
    quickThinkerMs: 10000
  };

  const CONSTANTS = {
    DIFFICULTY_TIERS,
    CONFIG,
    tierForRound
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = CONSTANTS;
  } else {
    root.CONSTANTS = CONSTANTS;
  }
})(typeof window !== 'undefined' ? window : globalThis);
