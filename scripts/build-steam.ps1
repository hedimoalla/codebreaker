<#
.SYNOPSIS
    Builds the Windows Electron app and stages it for a Steam upload.

.DESCRIPTION
    Produces dist/win-unpacked (and the NSIS installer) via electron-builder,
    then drops a steam_appid.txt next to the built executable so the game can
    be launched locally for Steamworks testing (see steam/README.md). It does
    NOT run steamcmd or upload anything — that step needs your own Steamworks
    partner credentials and is left as a manual/CI step (see steam/depot_config.vdf).
#>
$ErrorActionPreference = 'Stop'
Set-Location (Join-Path $PSScriptRoot '..')

Write-Host "Building Windows executable for Steam..." -ForegroundColor Cyan
npm run build:win
if ($LASTEXITCODE -ne 0) { throw "electron-builder failed" }

$unpackedDir = 'dist/win-unpacked'
if (Test-Path $unpackedDir) {
    $appId = if ($env:STEAM_APP_ID) { $env:STEAM_APP_ID } else { '480' } # 480 = Valve's public Spacewar test AppID
    Set-Content -Path (Join-Path $unpackedDir 'steam_appid.txt') -Value $appId -NoNewline
    Write-Host "Wrote steam_appid.txt ($appId) into $unpackedDir" -ForegroundColor Green
} else {
    Write-Host "Warning: $unpackedDir not found — check the electron-builder output above." -ForegroundColor Yellow
}

Write-Host ""
Write-Host "Next steps for Steam distribution:" -ForegroundColor Green
Write-Host "  1. Get a real Steam AppID from your Steamworks partner dashboard and set STEAM_APP_ID in .env"
Write-Host "  2. Download the Steamworks SDK (partner-only) into steam/steamworks_sdk/"
Write-Host "  3. Update steam/depot_config.vdf with your AppID + depot IDs and ContentRoot"
Write-Host "  4. Use steamcmd + ContentBuilder to upload:"
Write-Host "       steamcmd +login <user> +run_app_build ..\steam\depot_config.vdf +quit"
Write-Host "  5. Wire src/game.js's ANALYTICS/achievements TODOs to real Steamworks calls (see steam/README.md)"
