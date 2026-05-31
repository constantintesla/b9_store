# Добавляет разрешения камеры и сети в AndroidManifest после tauri android init.
# Запуск: powershell -ExecutionPolicy Bypass -File scripts/patch-android-manifest.ps1

$ErrorActionPreference = "Stop"

$manifest = Join-Path $PSScriptRoot "..\src-tauri\gen\android\app\src\main\AndroidManifest.xml"
if (-not (Test-Path $manifest)) {
    Write-Error "AndroidManifest не найден: $manifest. Сначала выполните: npm run tauri android init -- --ci"
}

$content = Get-Content $manifest -Raw

$permissions = @(
    'android.permission.CAMERA',
    'android.permission.INTERNET',
    'android.permission.ACCESS_NETWORK_STATE'
)

foreach ($perm in $permissions) {
    $line = "<uses-permission android:name=`"$perm`" />"
    if ($content -notmatch [regex]::Escape($perm)) {
        $content = $content -replace '(<manifest[^>]*>)', "`${1}`n    $line"
    }
}

if ($content -notmatch 'android.hardware.camera') {
    $feature = '    <uses-feature android:name="android.hardware.camera" android:required="false" />'
    $content = $content -replace '(<manifest[^>]*>)', "`${1}`n$feature"
}

Set-Content -Path $manifest -Value $content -NoNewline
Write-Host "AndroidManifest обновлён: $manifest"
