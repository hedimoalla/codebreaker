# Changelog

All notable changes to this project are documented here.
Format loosely follows [Keep a Changelog](https://keepachangelog.com/).

## [1.0.0] - 2026-07-27

### Added
- Core game: A=1..Z=26 number-cipher word puzzle with progressive difficulty,
  cumulative-sum anti-ambiguity hints, multi-interpretation detection, scribble
  canvas, and synthesized audio feedback.
- Word list moved out of source code into a real SQLite database
  (`src/data/words.sqlite`, queried via `sql.js`), built from an editable
  JSON source (`data/words-fallback.json` committed / `data/words-source.json`
  gitignored for private/licensed lists).
- Session persistence (Electron: JSON file via IPC; web/mobile: localStorage).
- Soft-currency economy (Shards), hints, achievements, and a sandboxed IAP
  store (cosmetics, hint packs, ad-free, season pass) — all local simulations
  pending real store SDK integration.
- Local analytics event log with a documented path to Steamworks/mobile
  analytics backends.
- Privacy policy page (`src/privacy.html`).
- Cross-platform build scaffolding: Electron (Windows/macOS/Linux via
  electron-builder), Tauri (alt desktop target), Capacitor (iOS/Android),
  and a plain static web build.
- Steam distribution scaffolding (`steam/`) with placeholder AppID/depot
  config and a documented Steamworks integration path.

### Known limitations
- The committed word list is a small curated set, not the official licensed
  NASPA/OWL2023 dictionary — see README "Word list".
- IAP, ads, and analytics are sandboxed/local until real SDKs are wired in.
- macOS builds must be produced on macOS (or a macOS CI runner).
