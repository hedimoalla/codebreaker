/**
 * words-db.js — runtime query layer over the real SQLite word database
 * (src/data/words.sqlite, built by scripts/build-word-db.js) using sql.js,
 * a WASM SQLite build vendored at src/vendor/sql-js/. Works unmodified in
 * Electron (file://), the plain web build (http-server), and a Capacitor
 * mobile WebView, since it's all just static assets + fetch().
 */
(function (root) {
  let SQL = null;
  let db = null;
  let readyPromise = null;

  function init() {
    if (readyPromise) return readyPromise;
    readyPromise = (async () => {
      if (typeof root.initSqlJs !== 'function') {
        throw new Error('sql.js runtime not loaded — check <script src="vendor/sql-js/sql-wasm.js"> in index.html');
      }
      SQL = await root.initSqlJs({ locateFile: (file) => `vendor/sql-js/${file}` });

      const response = await fetch('data/words.sqlite');
      if (!response.ok) {
        throw new Error(`Failed to load word database (HTTP ${response.status}). Run "npm run db:build" first.`);
      }
      const buffer = await response.arrayBuffer();
      db = new SQL.Database(new Uint8Array(buffer));
    })();
    return readyPromise;
  }

  function ensureReady() {
    if (!db) throw new Error('WORDSDB not initialized — call and await WORDSDB.init() first');
  }

  function isValidWord(word, lang) {
    ensureReady();
    const upper = String(word || '').toUpperCase();
    const language = lang || (typeof root.I18n !== 'undefined' ? root.I18n.getLanguage() : 'en');
    const stmt = db.prepare('SELECT 1 FROM words WHERE word = ? AND lang = ? LIMIT 1');
    stmt.bind([upper, language]);
    const found = stmt.step();
    stmt.free();
    return found;
  }

  function randomWordForLength(length, lang) {
    ensureReady();
    const language = lang || (typeof root.I18n !== 'undefined' ? root.I18n.getLanguage() : 'en');
    const stmt = db.prepare('SELECT word FROM words WHERE length = ? AND lang = ? ORDER BY RANDOM() LIMIT 1');
    stmt.bind([length, language]);
    let word = null;
    if (stmt.step()) word = stmt.getAsObject().word;
    stmt.free();
    return word;
  }

  function randomWordForTier(tier, lang) {
    ensureReady();
    const language = lang || (typeof root.I18n !== 'undefined' ? root.I18n.getLanguage() : 'en');
    const lengths = [...tier.lengths];
    for (let i = lengths.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [lengths[i], lengths[j]] = [lengths[j], lengths[i]];
    }
    for (const length of lengths) {
      const word = randomWordForLength(length, language);
      if (word) return word;
    }
    // Fallback if the requested tier's lengths have no matching words in the DB.
    const stmt = db.prepare('SELECT word FROM words WHERE lang = ? ORDER BY RANDOM() LIMIT 1');
    stmt.bind([language]);
    let word = null;
    if (stmt.step()) word = stmt.getAsObject().word;
    stmt.free();
    return word;
  }

  /**
   * Replace/augment the word database at runtime with a licensed/official
   * list. Pass an array of words (any case, length >= 4, letters only).
   */
  function loadCustomList(words, lang) {
    ensureReady();
    const language = lang || 'en';
    db.run('BEGIN TRANSACTION');
    const insert = db.prepare('INSERT OR REPLACE INTO words (word, length, lang) VALUES (?, ?, ?)');
    words.forEach((raw) => {
      const word = String(raw).toUpperCase().trim();
      if (/^[A-Z]{4,}$/.test(word)) insert.run([word, word.length, language]);
    });
    insert.free();
    db.run('COMMIT');
  }

  function wordCount() {
    ensureReady();
    const stmt = db.prepare('SELECT COUNT(*) AS c FROM words');
    stmt.step();
    const { c } = stmt.getAsObject();
    stmt.free();
    return c;
  }

  const WORDSDB = { init, isValidWord, randomWordForTier, loadCustomList, wordCount };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = WORDSDB;
  } else {
    root.WORDSDB = WORDSDB;
  }
})(typeof window !== 'undefined' ? window : globalThis);
