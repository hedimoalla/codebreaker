# Steamworks SDK (not included)

The Steamworks SDK is Valve partner-only software and can't be redistributed
in this repo. To integrate it:

1. Register the game on your [Steamworks partner dashboard](https://partner.steamgames.com/)
   and note your real **AppID**.
2. Download the SDK from the partner site and extract it here, so you have
   `steam/steamworks_sdk/sdk/...`.
3. From the Electron **main process** (not the renderer), bind to the SDK
   with a native Node addon such as [`steamworks.js`](https://www.npmjs.com/package/steamworks.js)
   or Greenworks, and expose the calls you need over IPC the same way
   `main.js` already exposes `storage:get` / `storage:set`:
   - `SteamUserStats.setAchievement(id)` / `storeStats()` — wire this into
     `checkAchievements()` in `src/game.js` (see the ACHIEVEMENTS array — the
     `id`s there are meant to double as Steam achievement API names).
   - `SteamUserStats.setStat(name, value)` for leaderboard-style stats
     (best round, total correct, etc.).
   - `SteamMicroTxn` (or Steam's newer purchase APIs) to replace the
     simulated `purchase()` function in `src/game.js`.
4. Update `steam/depot_config.vdf` and `steam/steam_config.xml` with your
   real AppID and depot ID.
5. Put your real AppID in `.env` as `STEAM_APP_ID` (see `.env.example`).

Until this is done, `steam_appid.txt` (written by `scripts/build-steam.ps1`)
uses `480`, Valve's public "Spacewar" test AppID, so the app can be launched
locally for testing without a registered game.
