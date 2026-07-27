# CodeBreaker

Crack scrambled A=1..Z=26 number ciphers to reveal hidden words. A single
codebase (plain HTML/CSS/JS, no framework, no bundler) ships to Windows,
macOS, Linux, the web, and iOS/Android.

## What's real vs. scaffolded

Everything under **Implemented** below runs and works today, offline, with
no external accounts or credentials. Everything under **Scaffolded** is
wired up with a clear extension point but intentionally does not talk to a
real paid/third-party service, because none is configured for this project.

**Implemented**
- The full game: cumulative-sum anti-ambiguity hints, progressive difficulty,
  multi-interpretation detection, scribble canvas, synthesized audio.
- Word list served from a real SQLite database (not hardcoded in JS).
- Session persistence (Electron: a JSON file on disk; web/mobile: localStorage).
- Soft-currency (Shards) economy, hints, and 9 achievements.
- Electron desktop packaging for Windows/macOS/Linux.
- Privacy policy page.

**Scaffolded (sandboxed locally, documented extension point)**
- In-app purchases (`src/game.js` → `MONETIZATION_CATALOG` / `purchase()`) —
  simulates entitlements locally; no payment SDK is wired in.
- Ads (`AdManager` in `src/game.js`) — logs instead of showing a real ad.
- Analytics (`src/analytics.js`) — logs locally; disabled by default.
- Steam, Tauri, and Capacitor (iOS/Android) builds — configured, but need a
  real Steamworks AppID / Xcode / Android Studio respectively to produce a
  final artifact (see per-platform sections below).

## Project structure

```
CodeBreaker/
├── src/                      # the game itself (ships as-is to web/mobile/desktop)
│   ├── index.html
│   ├── styles.css
│   ├── game.js               # cipher logic, canvas, audio, persistence, monetization, UI
│   ├── constants.js          # difficulty tiers + tunables (no word list)
│   ├── words-db.js           # runtime SQLite query layer (sql.js)
│   ├── analytics.js
│   ├── privacy.html
│   ├── data/words.sqlite     # generated — not committed, see "Word list" below
│   └── vendor/sql-js/        # generated — sql.js WASM runtime, not committed
├── data/
│   ├── words-fallback.json   # committed small word list (works out of the box)
│   ├── words-source.json     # gitignored — your private/licensed word list, if any
│   └── words-source.example.json
├── scripts/
│   ├── build-word-db.js      # data/*.json -> src/data/words.sqlite
│   ├── prepare-vendor.js     # vendors sql.js's WASM runtime into src/vendor
│   ├── build-web.js          # src/ -> www/ (used by web + Capacitor)
│   ├── build-steam.ps1
│   ├── build-mobile.ps1
│   └── release.ps1
├── mobile/                   # Capacitor (iOS/Android)
├── steam/                    # Steam distribution scaffolding
├── src-tauri/                # Tauri (alternative desktop packager)
├── build/                    # electron-builder resources (entitlements)
├── assets/                   # app icons (icon.ico/.icns/.png)
├── main.js / preload.js      # Electron entry point
├── electron-builder.json
└── package.json
```

## Quick start

```
npm install                 # also builds the word DB + vendors sql.js (postinstall)
npm start                    # run the desktop app (Electron)
```

For the web version instead:
```
npm run web:serve            # builds www/ and serves it at http://localhost:8080
```

If you ever see "Failed to load word database" or a blank word bank, run:
```
npm run db:build
npm run vendor:prepare
```

## Word list

The word list is **not hardcoded in JavaScript** — it lives in a real SQLite
database (`src/data/words.sqlite`), queried at runtime via
[`sql.js`](https://github.com/sql-js/sql.js) (a WASM SQLite build that works
identically in Electron, the browser, and a Capacitor mobile WebView).

The database is generated, not committed — same for `data/words-source.json`.
That JSON file is gitignored on purpose:

- `data/words-fallback.json` — a small **committed** curated list of common
  English words. It's NOT the official licensed NASPA/OWL2023 Scrabble
  dictionary — just enough to play. Used automatically if no private source exists.
- `data/words-source.json` — if you create this file locally (copy
  `data/words-source.example.json` for the format), it's used instead and
  never gets committed. Drop a real licensed word list here for tournament-
  quality play.

Either way, run `npm run db:build` after changing the word list to regenerate
`src/data/words.sqlite`.

## Building for each target

### Windows / macOS / Linux (Electron)
```
npm run build:win
npm run build:mac      # must run on macOS (or a macOS CI runner)
npm run build:linux
```
Output goes to `dist/`. Packaging config is in `electron-builder.json`.

### Windows / macOS / Linux (Tauri — smaller binaries, alternative to Electron)
```
npm run tauri:icon      # once, to generate src-tauri/icons/ from assets/icon.png
npm run tauri:dev
npm run tauri:build
```
Requires the [Rust toolchain](https://www.rust-lang.org/tools/install) and
platform build tools (see [Tauri prerequisites](https://tauri.app/v1/guides/getting-started/prerequisites)).

### Web (browser / itch.io)
```
npm run build            # writes a static bundle to www/
```
Upload the contents of `www/` anywhere that serves static files (itch.io,
GitHub Pages, Netlify, S3, ...). No server-side code is required.

### iOS / Android (Capacitor)
```
npm run cap:add:android          # once
npm run cap:add:ios              # once, macOS + Xcode only
.\scripts\build-mobile.ps1       # builds www/ and runs `cap sync`
npm run cap:open:android         # or cap:open:ios
```
From there, build/sign/submit using Android Studio / Xcode as normal. Run
`npm run cap:assets` (after editing `mobile/resources/icon.png`) to generate
full platform icon sets.

### Steam
See `steam/README.md`. Short version: `.\scripts\build-steam.ps1` builds the
Windows app and stages `steam_appid.txt`; uploading requires your own
Steamworks partner AppID and the Steamworks SDK (not included, partner-only).

## Monetization

`src/game.js` implements a full local economy: Shards (earned by solving
puzzles, spent on hints) and an IAP catalog (ad-free, shard packs, hint
packs, cosmetic ink themes, a season pass). **Purchases in this build are
simulated** — `purchase()` grants the entitlement locally and logs a
`console.warn`, it does not charge anyone. Before shipping for real money,
replace it with:
- Steam: Steamworks microtransactions, called from the Electron main process
  and IPC'd to the renderer (see `steam/steamworks_sdk/README.md`).
- iOS/Android: a Capacitor IAP plugin (StoreKit / Google Play Billing) with
  server-side receipt validation.

## Privacy

`src/privacy.html` is a plain-language privacy policy reflecting what the
app actually does today (nothing leaves the device by default). Host it at a
public URL when submitting to app stores that require one, and update it
before enabling real analytics/ads/IAP.

## License

MIT — see `LICENSE`.
