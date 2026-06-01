# Shrinks APK: removes keepDebugSymbols padding, enables legacy jniLibs packaging.
# Run: powershell -ExecutionPolicy Bypass -File scripts/patch-android-gradle.ps1

$ErrorActionPreference = "Stop"

$gradle = Join-Path $PSScriptRoot "..\src-tauri\gen\android\app\build.gradle.kts"
if (-not (Test-Path $gradle)) {
    Write-Error "build.gradle.kts not found: $gradle"
}

$content = Get-Content $gradle -Raw -Encoding UTF8

$content = $content -replace '(?s)\s*packaging\s*\{\s*jniLibs\.keepDebugSymbols\.add\([^)]+\)\s*jniLibs\.keepDebugSymbols\.add\([^)]+\)\s*jniLibs\.keepDebugSymbols\.add\([^)]+\)\s*jniLibs\.keepDebugSymbols\.add\([^)]+\)\s*\}', ''

if ($content -notmatch 'useLegacyPackaging') {
    $marker = "    buildFeatures {"
  $insert = @'
    packaging {
        jniLibs {
            useLegacyPackaging = true
        }
    }
'@ + "`r`n" + $marker
    if ($content.Contains($marker)) {
        $content = $content.Replace($marker, $insert)
    } else {
        Write-Warning "buildFeatures block not found; add packaging.jniLibs.useLegacyPackaging manually"
    }
}

Set-Content -Path $gradle -Value $content -NoNewline -Encoding UTF8
Write-Host "Patched build.gradle.kts (smaller APK): $gradle"
