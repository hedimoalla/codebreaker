<#
.SYNOPSIS
    Orchestrates a full local release build: word DB, vendor assets, Windows
    desktop build, and the web bundle. Prints a manual checklist for the
    platform-specific steps that need real credentials (Steam, mobile stores).

.DESCRIPTION
    This script does not publish/upload anything or touch git — it only
    builds local artifacts under dist/ and www/.
#>
$ErrorActionPreference = 'Stop'
Set-Location (Join-Path $PSScriptRoot '..')

function Step($msg) { Write-Host "`n==> $msg" -ForegroundColor Cyan }

Step "Rebuilding word database"
npm run db:build
if ($LASTEXITCODE -ne 0) { throw "db:build failed" }

Step "Preparing sql.js vendor runtime"
npm run vendor:prepare
if ($LASTEXITCODE -ne 0) { throw "vendor:prepare failed" }

Step "Building Windows desktop app (electron-builder)"
npm run build:win
if ($LASTEXITCODE -ne 0) { throw "build:win failed" }

Step "Building web bundle (www/)"
npm run build
if ($LASTEXITCODE -ne 0) { throw "build (web) failed" }

Write-Host ""
Write-Host "Local build artifacts ready:" -ForegroundColor Green
Write-Host "  dist/   - Windows installer + unpacked app"
Write-Host "  www/    - static web build (serve with 'npm run web:serve', or deploy to itch.io)"
Write-Host ""
Write-Host "Manual checklist before shipping:" -ForegroundColor Yellow
Write-Host "  [ ] Bump version in package.json and add an entry to CHANGELOG.md"
Write-Host "  [ ] macOS build must run on a Mac (or macOS CI runner) — this script only builds Windows"
Write-Host "  [ ] .\scripts\build-steam.ps1  -> stage + upload to Steam (needs Steamworks credentials)"
Write-Host "  [ ] .\scripts\build-mobile.ps1 -> sync Capacitor projects, then build in Xcode/Android Studio"
Write-Host "  [ ] Review src/privacy.html and host it at a public URL for store submissions"
Write-Host "  [ ] Replace the sandboxed IAP/ads/analytics stubs in src/game.js with real SDKs"
