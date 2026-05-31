# Настраивает подпись release APK в gen/android/app/build.gradle.kts
$ErrorActionPreference = "Stop"

$buildGradle = Join-Path $PSScriptRoot "..\src-tauri\gen\android\app\build.gradle.kts"
$props = Join-Path $PSScriptRoot "..\src-tauri\gen\android\keystore\keystore.properties"

if (-not (Test-Path $props)) {
    Write-Error "Keystore не найден. Сначала: scripts/create-release-keystore.ps1"
}

$content = Get-Content $buildGradle -Raw
if ($content -match 'signingConfigs') {
    Write-Host "Release signing уже настроен."
    exit 0
}

$signingBlock = @'

val releaseKeystoreProperties = Properties().apply {
    val keystoreFile = rootProject.file("keystore/keystore.properties")
    if (keystoreFile.exists()) {
        keystoreFile.inputStream().use { load(it) }
    }
}

'@

$content = $content -replace '(val tauriProperties = Properties\(\)\.apply \{[\s\S]*?\}\)\s*\n', "`$0$signingBlock"

$content = $content -replace '(android \{[\s\S]*?defaultConfig \{[\s\S]*?\}\s*)', @'
$1    signingConfigs {
        create("release") {
            val storeFilePath = releaseKeystoreProperties.getProperty("storeFile")
            if (storeFilePath != null) {
                keyAlias = releaseKeystoreProperties.getProperty("keyAlias")
                keyPassword = releaseKeystoreProperties.getProperty("keyPassword")
                storeFile = rootProject.file(storeFilePath)
                storePassword = releaseKeystoreProperties.getProperty("storePassword")
            }
        }
    }
'@

$content = $content -replace '(getByName\("release"\) \{[\s\S]*?isMinifyEnabled = true)', '$1
            signingConfig = signingConfigs.getByName("release")'

Set-Content -Path $buildGradle -Value $content -NoNewline
Write-Host "Release signing добавлен в $buildGradle"
