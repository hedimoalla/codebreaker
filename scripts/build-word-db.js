#!/usr/bin/env node
/**
 * Compiles data/words-source.json into a real SQLite database file at
 * src/data/words.sqlite, queried at runtime by src/words-db.js (via sql.js,
 * a WASM SQLite build that runs identically in Electron, the browser, and
 * Capacitor's mobile WebView — no native module compilation required).
 *
 * Usage: node scripts/build-word-db.js
 * (also runs automatically via `npm run db:build` / after `npm install`)
 */
const fs = require('fs');
const path = require('path');
const initSqlJs = require('sql.js');

// words-source.json is gitignored — a developer's local/private/licensed word
// list (e.g. a real NASPA/OWL2023 export) that never gets committed. When
// absent, we fall back to the small list committed in words-fallback.json so
// the game still works right after a fresh `git clone && npm install`.
const PRIVATE_SOURCE_PATH = path.join(__dirname, '..', 'data', 'words-source.json');
const FALLBACK_SOURCE_PATH = path.join(__dirname, '..', 'data', 'words-fallback.json');
const FRENCH_SOURCE_PATH = path.join(__dirname, '..', 'data', 'words-french.json');
const OUT_DIR = path.join(__dirname, '..', 'src', 'data');
const OUT_PATH = path.join(OUT_DIR, 'words.sqlite');
const WASM_DIR = path.dirname(require.resolve('sql.js/dist/sql-wasm.wasm'));

async function main() {
  const usingPrivateSource = fs.existsSync(PRIVATE_SOURCE_PATH);
  const englishSourcePath = usingPrivateSource ? PRIVATE_SOURCE_PATH : FALLBACK_SOURCE_PATH;
  console.log(`Using English word list: ${path.relative(process.cwd(), englishSourcePath)}${usingPrivateSource ? ' (local, gitignored)' : ' (committed fallback)'}`);

  const SQL = await initSqlJs({ locateFile: (file) => path.join(WASM_DIR, file) });
  const db = new SQL.Database();

  db.run(`
    CREATE TABLE words (
      word TEXT NOT NULL,
      length INTEGER NOT NULL,
      lang TEXT NOT NULL,
      PRIMARY KEY (word, lang)
    );
    CREATE INDEX idx_words_lang_length ON words(lang, length);
  `);

  const insert = db.prepare('INSERT OR IGNORE INTO words (word, length, lang) VALUES (?, ?, ?)');
  let total = 0;
  let rejected = 0;

  // Load and insert English words
  const englishSource = JSON.parse(fs.readFileSync(englishSourcePath, 'utf-8'));
  const englishWordsByLength = englishSource.words;

  Object.entries(englishWordsByLength).forEach(([lengthKey, list]) => {
    const expectedLength = Number(lengthKey);
    list.forEach((raw) => {
      const word = String(raw).toUpperCase().trim();
      if (!/^[A-Z]+$/.test(word) || word.length !== expectedLength) {
        rejected += 1;
        console.warn(`  ! skipping malformed EN entry "${raw}" (expected length ${expectedLength})`);
        return;
      }
      insert.run([word, word.length, 'en']);
      total += 1;
    });
  });

  // Load and insert French words (if available)
  if (fs.existsSync(FRENCH_SOURCE_PATH)) {
    console.log(`Using French word list: ${path.relative(process.cwd(), FRENCH_SOURCE_PATH)}`);
    const frenchSource = JSON.parse(fs.readFileSync(FRENCH_SOURCE_PATH, 'utf-8'));
    const frenchWordsByLength = frenchSource.words;

    Object.entries(frenchWordsByLength).forEach(([lengthKey, list]) => {
      const expectedLength = Number(lengthKey);
      list.forEach((raw) => {
        const word = String(raw).toUpperCase().trim();
        if (!/^[A-Z]+$/.test(word) || word.length !== expectedLength) {
          rejected += 1;
          console.warn(`  ! skipping malformed FR entry "${raw}" (expected length ${expectedLength})`);
          return;
        }
        insert.run([word, word.length, 'fr']);
        total += 1;
      });
    });
  }

  insert.free();

  fs.mkdirSync(OUT_DIR, { recursive: true });
  const bytes = db.export();
  fs.writeFileSync(OUT_PATH, Buffer.from(bytes));
  db.close();

  console.log(`Built ${OUT_PATH}`);
  console.log(`  ${total} words inserted${rejected ? `, ${rejected} rejected` : ''}`);
}

main().catch((err) => {
  console.error('Failed to build word database:', err);
  process.exit(1);
});
