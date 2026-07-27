<#
.SYNOPSIS
    Builds the web bundle and syncs it into the Capacitor iOS/Android projects.

.DESCRIPTION
    Run this after editing anything in src/. It does NOT create the native
    ios/ or android/ projects the first time — run these once per machine:
        npm run cap:add:android
        npm run cap:add:ios      (requires Xcode, macOS only)
#>
$ErrorActionPreference = 'Stop'
Set-Location (Join-Path $PSScriptRoot '..')

Write-Host "Building web bundle..." -ForegroundColor Cyan
npm run build
if ($LASTEXITCODE -ne 0) { throw "Web build failed" }

$hasAndroid = Test-Path 'mobile/android'
$hasIos = Test-Path 'mobile/ios'

if (-not $hasAndroid -and -not $hasIos) {
    Write-Host ""
    Write-Host "No native mobile projects found yet. Create them first:" -ForegroundColor Yellow
    Write-Host "  npm run cap:add:android"
    Write-Host "  npm run cap:add:ios     (macOS + Xcode required)"
    Write-Host ""
    exit 0
}

Write-Host "Syncing web assets into native project(s)..." -ForegroundColor Cyan
Push-Location mobile
try {
    npx cap sync
    if ($LASTEXITCODE -ne 0) { throw "cap sync failed" }
} finally {
    Pop-Location
}

Write-Host ""
Write-Host "Done. Next steps:" -ForegroundColor Green
if ($hasAndroid) { Write-Host "  npm run cap:open:android   # opens Android Studio" }
if ($hasIos)     { Write-Host "  npm run cap:open:ios       # opens Xcode (macOS only)" }
Write-Host "Run 'npm run cap:assets' first if you've changed mobile/resources/icon.png."
