# Steam distribution

This folder holds the pieces needed to ship CodeBreaker's Electron build on
Steam. None of this uploads anything by itself — it's the scaffolding you
wire your real Steamworks partner account into.

## Files

- `steam_config.xml` — placeholder Steamworks config (`YOURAPPID`).
- `depot_config.vdf` — ContentBuilder app-build script for `steamcmd`.
  Ships with `preview: "1"` (dry run) so it can't accidentally upload
  anything until you deliberately flip it to `"0"`.
- `steamworks_sdk/` — empty; see `steamworks_sdk/README.md` for how to add
  the real (partner-only) SDK and wire achievements/stats/microtransactions.

## Pipeline

1. `..\scripts\build-steam.ps1` — builds the Windows Electron app
   (`dist/win-unpacked`) and drops a `steam_appid.txt` next to it for local
   Steamworks API testing.
2. Get a real AppID + depot ID from your Steamworks partner dashboard and
   update `steam_config.xml`, `depot_config.vdf`, and `.env`'s `STEAM_APP_ID`.
3. Download the Steamworks SDK into `steamworks_sdk/` and follow its
   README to bind achievements/stats/microtransactions.
4. Upload with `steamcmd`:
   ```
   steamcmd +login <your-steam-build-account> +run_app_build depot_config.vdf +quit
   ```
   (run from this `steam/` directory; flip `"preview"` to `"0"` in
   `depot_config.vdf` first — a preview run does not actually upload).
5. macOS/Linux builds work the same way with their own depots — build them
   with `npm run build:mac` / `npm run build:win` / `npm run build:linux`
   (macOS builds require a Mac or macOS CI runner) and point additional
   depot entries in `depot_config.vdf` at their `dist/` output folders.
