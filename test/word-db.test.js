const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const initSqlJs = require('sql.js');

const DB_PATH = path.join(__dirname, '..', 'src', 'data', 'words.sqlite');

async function openDb() {
  const SQL = await initSqlJs({
    locateFile: (file) => path.join(path.dirname(require.resolve('sql.js/dist/sql-wasm.wasm')), file)
  });
  const buffer = fs.readFileSync(DB_PATH);
  return new SQL.Database(new Uint8Array(buffer));
}

test('word database exists and has rows', async () => {
  assert.ok(fs.existsSync(DB_PATH), 'run `npm run db:build` first');
  const db = await openDb();
  const stmt = db.prepare('SELECT COUNT(*) AS c FROM words');
  stmt.step();
  const { c } = stmt.getAsObject();
  stmt.free();
  assert.ok(c > 0, 'expected at least one word in the database');
  db.close();
});

test('every stored word length matches its length column', async () => {
  const db = await openDb();
  const stmt = db.prepare('SELECT word, length FROM words');
  let checked = 0;
  while (stmt.step()) {
    const { word, length } = stmt.getAsObject();
    assert.strictEqual(word.length, length, `"${word}" has length ${word.length} but is stored as ${length}`);
    assert.match(word, /^[A-Z]+$/, `"${word}" should be uppercase letters only`);
    checked += 1;
  }
  stmt.free();
  db.close();
  assert.ok(checked > 0);
});

test('random word selection returns words of the requested length', async () => {
  const db = await openDb();
  for (const length of [4, 5, 6, 7, 8]) {
    const stmt = db.prepare('SELECT word FROM words WHERE length = ? ORDER BY RANDOM() LIMIT 1');
    stmt.bind([length]);
    assert.ok(stmt.step(), `expected at least one word of length ${length}`);
    const { word } = stmt.getAsObject();
    assert.strictEqual(word.length, length);
    stmt.free();
  }
  db.close();
});
