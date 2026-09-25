# CodeBreaker

Crack scrambled A=1..Z=26 number ciphers to reveal hidden words. Multi-language support (EN/FR), cloud save with Supabase authentication, and a daily challenge system. A single codebase (vanilla HTML/CSS/JS, no framework) ships to Windows, macOS, Linux, the web, and iOS/Android.

## Features

**Core Game**
- A=1..Z=26 cipher with cumulative-sum anti-ambiguity hints
- Progressive difficulty (Easy/Medium/Hard)
- Multi-interpretation detection with warnings
- Scribble canvas for working through puzzles
- Synthesized audio feedback
- Soft-currency (Shards) economy and hints

**Phase 1: Multi-Language Support**
- English and French word lists (241 EN + 563 FR words)
- Proper diacritical normalization (é→E, ç→C, etc.)
- Language-aware SQLite database with `lang` column
- Automatic language selection from UI menu

**Phase 2: Cloud Save + Supabase**
- Optional Supabase integration (anonymous sign-in, no account required)
- Cloud profile sync with local fallback
- Row-level security for user privacy
- Settings toggle to enable cloud save in-game

**Daily Challenge**
- One 5-letter puzzle per day, resets at UTC midnight
- Same word for all players (deterministic selection)
- Never repeats words via server-side tracking
- Streak counter and best-round tracking
- Completion stats screen with solve time

**Platform Support**
- Web: http://localhost:8080 (or any static host)
- Electron desktop (Windows/macOS/Linux)
- Mobile: iOS/Android via Capacitor
- Offline-first design (local SQLite, optional cloud sync)

**Infrastructure**
- Supabase backend (Postgres + Auth + REST API)
- Anonymous authentication by default
- Client-side word database (SQL.js WASM)
- Zero external dependencies for casual play

**Future Phases**
- Phase 3: Google Sign-In linking for cross-device accounts
- Phase 4: Ranked mode with server-side anti-cheat + leaderboard

## Project Structure

```
CodeBreaker/
├── src/                           # game (ships as-is to web/mobile/desktop)
│   ├── index.html                 # menu, game UI, modals
│   ├── styles.css                 # centered layout, dark/light theme
│   ├── game.js                    # cipher logic, canvas, audio, UI, persistence
│   ├── constants.js               # difficulty tiers (Easy/Medium/Hard)
│   ├── words-db.js                # SQLite query layer (sql.js), language-aware
│   ├── i18n.js                    # internationalization (EN/FR) + theme toggle
│   ├── analytics.js               # event logging (disabled by default)
│   ├── supabase-client.js         # cloud save via REST API (optional)
│   ├── privacy.html
│   ├── data/words.sqlite          # generated, not committed
│   └── vendor/sql-js/             # generated, not committed
├── data/
│   ├── words-fallback.json        # small EN list (fallback)
│   ├── words-source.json          # gitignored — your licensed EN word list
│   ├── words-source.example.json  # template
│   └── words-french.json          # FR list (~560 words, normalized)
├── supabase/
│   └── migrations/
│       ├── 20250920000001_init.sql                    # profiles, leaderboard, ranked tables
│       ├── 20250920000002_daily_challenges.sql        # daily challenge table
│       └── 20260923000001_daily_word_pool.sql         # enhanced daily word pool
├── scripts/
│   ├── build-word-db.js           # data/*.json -> src/data/words.sqlite (EN + FR)
│   ├── prepare-vendor.js          # vendor sql.js WASM runtime
│   ├── build-web.js               # src/ -> www/
│   ├── build-steam.ps1
│   ├── build-mobile.ps1
│   └── release.ps1
├── mobile/                        # Capacitor (iOS/Android)
├── steam/                         # Steam distribution
├── src-tauri/                     # Tauri (alternative desktop packager)
├── build/                         # Electron builder resources
├── assets/                        # icons (icon.ico/.icns/.png)
├── main.js / preload.js           # Electron entry point
├── electron-builder.json
├── package.json
└── README.md                      # this file
```

## Quick start

```bash
npm install                 # builds word DB + vendors sql.js (postinstall)
npm start                    # run the desktop app (Electron)
```

For the web version:
```bash
npm run web:serve           # builds www/ and serves it at http://localhost:8080
```

To rebuild the word database (multi-language support):
```bash
npm run db:build            # reads English + French sources, outputs words.sqlite
npm test                    # verify 241 EN + 563 FR words are loaded
```

## Supabase Setup (Optional Cloud Features)

Cloud save, daily challenges, and future ranked mode require a Supabase project.

**Create a free Supabase project:**
1. Go to [supabase.com](https://supabase.com)
2. Create a new project (or use an existing one)
3. Go to **Settings → API** and copy the project URL and anon key
4. Create `src/.env.local` (gitignored):
   ```
   VITE_SUPABASE_URL=https://your-project.supabase.co
   VITE_SUPABASE_ANON_KEY=your-anon-key
   ```

**Enable authentication:**
1. Go to **Authentication → Providers**
2. Enable **Anonymous** (for cloud save without passwords)
3. Optionally enable **Google** for Phase 3 (account linking)

**Apply database migrations:**
1. Go to **SQL Editor**
2. Copy and run each migration from `supabase/migrations/`:
   - `20250920000001_init.sql` — profiles, words, ranked_sessions, leaderboard
   - `20250920000002_daily_challenges.sql` — daily challenge table + constraints
   - `20260923000001_daily_word_pool.sql` — enhanced daily word pool (replaces the above)
3. Grant access to anon role:
   ```sql
   GRANT SELECT ON daily_challenges TO anon;
   ```

**Seed daily words:**
```sql
INSERT INTO daily_challenges (date, word, lang) VALUES 
  (CURRENT_DATE, 'HOUSE', 'en'),
  (CURRENT_DATE, 'MAISON', 'fr')
ON CONFLICT DO NOTHING;
```

The app will automatically:
- Sign users in anonymously when they enable Cloud Save
- Sync progress to the cloud
- Fetch today's daily challenge word
- Track streaks and leaderboard entries (future phases)

## Word Lists

The word lists are **not hardcoded in JavaScript** — they live in a real SQLite database (`src/data/words.sqlite`), queried at runtime via [`sql.js`](https://github.com/sql-js/sql.js) (a WASM SQLite build that works identically in Electron, the browser, and Capacitor).

**English words:**
- `data/words-fallback.json` — small **committed** list (~250 words). Works out of the box.
- `data/words-source.json` — gitignored; drop your own licensed list here (e.g., NASPA/OWL2023).

**French words:**
- `data/words-french.json` — committed list (~560 words). Normalized to unaccented uppercase for A=1..Z=26 cipher compatibility.

**Multi-language schema:**
The SQLite database has a `lang` column supporting future languages:
```sql
CREATE TABLE words (
  word TEXT NOT NULL,
  length INTEGER NOT NULL,
  lang TEXT NOT NULL,      -- 'en', 'fr', etc.
  PRIMARY KEY (word, lang)
);
```

The build script (`scripts/build-word-db.js`) reads both sources and tags each word. Run after changes:
```bash
npm run db:build
```

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

## Monetization & IAP

`src/game.js` implements a full local economy:
- **Shards** — soft currency earned by solving puzzles, spent on hints
- **IAP Catalog** — ad-free, shard packs, hint packs, cosmetic themes (simulated locally)

**Current Status:**
- Purchases are simulated locally — `purchase()` grants entitlements and logs to console
- Does not connect to real payment processors

**To ship for real money:**
- Steam: Steamworks microtransactions via main process IPC
- iOS/Android: Capacitor IAP plugin (StoreKit / Google Play Billing) + server validation
- Web: Stripe or similar payment processor integrated via Edge Functions

Currently, the focus is on cloud features (Phase 2-4) rather than monetization.
Monetization can be added once the ranked mode and leaderboard are live.

## Privacy & Data

The app follows a **privacy-first** design:

**Casual Mode (Default)**
- Nothing leaves your device
- All progress stored locally (localStorage on web, JSON file in Electron)
- Works 100% offline

**Cloud Save Mode (Optional)**
- Requires explicit opt-in via Settings → "Cloud Save"
- Syncs game progress to Supabase (Postgres database)
- Uses anonymous authentication (no password or email required)
- Subject to Supabase's privacy policy and terms

**Daily Challenge**
- Fetches today's word from server (public, non-identifying)
- Server never learns your identity unless you enable Cloud Save
- Streak/completion stats synced only if Cloud Save is enabled

Update `src/privacy.html` before shipping to production. It currently states
that nothing leaves the device, which is true by default but should be updated
to reflect optional Supabase integration and daily challenge data retrieval.

## License

MIT — see `LICENSE`.
