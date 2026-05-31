# Создаёт keystore для подписи release APK (один раз).
# Запуск: powershell -ExecutionPolicy Bypass -File scripts/create-release-keystore.ps1

$ErrorActionPreference = "Stop"

$KeyDir = Join-Path $PSScriptRoot "..\src-tauri\gen\android\keystore"
$KeyStore = Join-Path $KeyDir "b9_store_release.jks"
$PropsFile = Join-Path $KeyDir "keystore.properties"

if (Test-Path $KeyStore) {
    Write-Host "Keystore уже существует: $KeyStore"
    exit 0
}

$JavaHome = $env:JAVA_HOME
if (-not $JavaHome -or -not (Test-Path (Join-Path $JavaHome "bin\keytool.exe"))) {
    $JavaHome = "C:\Program Files\Eclipse Adoptium\jdk-21.0.6.7-hotspot"
}

$keytool = Join-Path $JavaHome "bin\keytool.exe"
if (-not (Test-Path $keytool)) {
    Write-Error "keytool не найден. Установите JDK 17+."
}

New-Item -ItemType Directory -Force -Path $KeyDir | Out-Null

$storePass = if ($env:B9_KEYSTORE_PASSWORD) { $env:B9_KEYSTORE_PASSWORD } else { -join ((48..57 + 65..90 + 97..122) | Get-Random -Count 24 | ForEach-Object { [char]$_ }) }
$keyPass = $storePass
$alias = "b9store"

Write-Host "Создание keystore: $KeyStore"
& $keytool -genkeypair -v `
    -keystore $KeyStore `
    -alias $alias `
    -keyalg RSA `
    -keysize 2048 `
    -validity 10000 `
    -storepass $storePass `
    -keypass $keyPass `
    -dname "CN=B9 Store POS, OU=Preshev Kadastr, O=Preshev Kadastr, L=Preshev, ST=Preshev, C=RU"

@"
storePassword=$storePass
keyPassword=$keyPass
keyAlias=$alias
storeFile=keystore/b9_store_release.jks
"@ | Out-File -FilePath $PropsFile -Encoding ascii

Write-Host ""
Write-Host "Keystore создан."
Write-Host "Файлы (не коммитьте в git):"
Write-Host "  $KeyStore"
Write-Host "  $PropsFile"
Write-Host ""
Write-Host "Пароль keystore (сохраните): $storePass"
