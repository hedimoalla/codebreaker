#!/usr/bin/env node
/**
 * Copies src/ into www/ — a stable, bundler-independent web root consumed by
 * `http-server` (web build) and Capacitor (`npx cap sync`, see
 * mobile/capacitor.config.json's webDir: "../www"). No transpilation/bundling
 * is needed since the game is plain HTML/CSS/JS + a WASM SQLite DB.
 *
 * Usage: node scripts/build-web.js (also runs via `npm run build`)
 */
const fs = require('fs');
const path = require('path');

const SRC_DIR = path.join(__dirname, '..', 'src');
const OUT_DIR = path.join(__dirname, '..', 'www');

function copyRecursive(src, dest) {
  const stat = fs.statSync(src);
  if (stat.isDirectory()) {
    fs.mkdirSync(dest, { recursive: true });
    for (const entry of fs.readdirSync(src)) {
      copyRecursive(path.join(src, entry), path.join(dest, entry));
    }
  } else {
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(src, dest);
  }
}

if (!fs.existsSync(path.join(SRC_DIR, 'data', 'words.sqlite'))) {
  console.warn('src/data/words.sqlite not found — run "npm run db:build" first.');
}
if (!fs.existsSync(path.join(SRC_DIR, 'vendor', 'sql-js', 'sql-wasm.wasm'))) {
  console.warn('src/vendor/sql-js not found — run "npm run vendor:prepare" first.');
}

fs.rmSync(OUT_DIR, { recursive: true, force: true });
copyRecursive(SRC_DIR, OUT_DIR);

console.log(`Built web bundle -> ${OUT_DIR}`);
