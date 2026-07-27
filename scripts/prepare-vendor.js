#!/usr/bin/env node
/**
 * Copies the sql.js browser runtime (JS glue + WASM binary) into
 * src/vendor/sql-js/ so it ships as a plain static asset alongside the rest
 * of src/ — no node_modules required at runtime in Electron, the browser,
 * or a Capacitor mobile build.
 *
 * Usage: node scripts/prepare-vendor.js (runs automatically after npm install)
 */
const fs = require('fs');
const path = require('path');

const DIST_DIR = path.dirname(require.resolve('sql.js/dist/sql-wasm.js'));
const OUT_DIR = path.join(__dirname, '..', 'src', 'vendor', 'sql-js');

const FILES = ['sql-wasm.js', 'sql-wasm.wasm'];

fs.mkdirSync(OUT_DIR, { recursive: true });
FILES.forEach((file) => {
  fs.copyFileSync(path.join(DIST_DIR, file), path.join(OUT_DIR, file));
  console.log(`Vendored ${file} -> src/vendor/sql-js/${file}`);
});
