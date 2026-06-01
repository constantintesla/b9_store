# Устанавливает Android SDK command-line tools и необходимые пакеты для сборки Tauri APK.
# Запуск: powershell -ExecutionPolicy Bypass -File scripts/setup-android.ps1

$ErrorActionPreference = "Stop"

$Root = Split-Path $PSScriptRoot -Parent
$LocalCmdlineZip = Join-Path $Root "commandlinetools-win-11076708_latest.zip"

$SdkRoot = Join-Path $env:LOCALAPPDATA "Android\Sdk"
$CmdToolsDir = Join-Path $SdkRoot "cmdline-tools\latest"
$SdkManager = Join-Path $CmdToolsDir "bin\sdkmanager.bat"

$JdkCandidates = @(
    "C:\Program Files\Eclipse Adoptium\jdk-21.0.6.7-hotspot",
    "C:\Program Files\Eclipse Adoptium\jdk-21*",
    "C:\Program Files\Java\jdk-17",
    "C:\Program Files\Eclipse Adoptium\jdk-17*"
)

$JavaHome = $null
foreach ($candidate in $JdkCandidates) {
    $resolved = Get-Item $candidate -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($resolved -and (Test-Path (Join-Path $resolved.FullName "bin\java.exe"))) {
        $JavaHome = $resolved.FullName
        break
    }
}

if (-not $JavaHome) {
    Write-Error "JDK 17+ не найден. Установите Eclipse Temurin 17 или 21."
}

$env:JAVA_HOME = $JavaHome
$env:ANDROID_HOME = $SdkRoot
$env:ANDROID_SDK_ROOT = $SdkRoot
$env:Path = "$JavaHome\bin;$SdkRoot\platform-tools;$CmdToolsDir\bin;" + $env:Path

Write-Host "JAVA_HOME=$JavaHome"
Write-Host "ANDROID_HOME=$SdkRoot"

New-Item -ItemType Directory -Force -Path $SdkRoot | Out-Null

if (-not (Test-Path $SdkManager)) {
    $extractDir = Join-Path $env:TEMP ("android-cmdline-tools-{0}" -f ([guid]::NewGuid().ToString("N")))
    $zipPath = $null
    $removeZipAfter = $false

    if (Test-Path $LocalCmdlineZip) {
        Write-Host "Используем локальный архив: $LocalCmdlineZip"
        $zipPath = $LocalCmdlineZip
    } else {
        $zipUrl = "https://dl.google.com/android/repository/commandlinetools-win-11076708_latest.zip"
        $zipPath = Join-Path $env:TEMP ("android-cmdline-tools-{0}.zip" -f ([guid]::NewGuid().ToString("N")))
        $removeZipAfter = $true

        Write-Host "Скачивание Android command-line tools..."
        Invoke-WebRequest -Uri $zipUrl -OutFile $zipPath -UseBasicParsing
    }

    if (Test-Path $extractDir) {
        Remove-Item $extractDir -Recurse -Force
    }
    Expand-Archive -Path $zipPath -DestinationPath $extractDir -Force

    New-Item -ItemType Directory -Force -Path (Join-Path $SdkRoot "cmdline-tools") | Out-Null
    $src = Get-ChildItem $extractDir -Directory | Select-Object -First 1
    if (Test-Path $CmdToolsDir) {
        Remove-Item $CmdToolsDir -Recurse -Force
    }
    Move-Item $src.FullName $CmdToolsDir
    if ($removeZipAfter) {
        Remove-Item $zipPath -Force -ErrorAction SilentlyContinue
    }
}

Write-Host "Установка SDK компонентов (platform-tools, build-tools, platform, ndk)..."
$packages = @(
    "platform-tools",
    "platforms;android-34",
    "build-tools;34.0.0",
    "ndk;26.1.10909125"
)

foreach ($pkg in $packages) {
    Write-Host "  -> $pkg"
    $prevEap = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    try {
        echo "y" | & $SdkManager $pkg 2>&1 | ForEach-Object { Write-Host $_ }
        if ($LASTEXITCODE -ne 0) {
            throw "sdkmanager завершился с кодом $LASTEXITCODE для пакета: $pkg"
        }
    } finally {
        $ErrorActionPreference = $prevEap
    }
}

Write-Host ""
Write-Host "Готово. Добавьте в профиль PowerShell:"
Write-Host '  $env:JAVA_HOME = "' + $JavaHome + '"'
Write-Host '  $env:ANDROID_HOME = "' + $SdkRoot + '"'
Write-Host '  $env:ANDROID_SDK_ROOT = "' + $SdkRoot + '"'
Write-Host '  $env:NDK_HOME = "' + (Join-Path $SdkRoot "ndk\26.1.10909125") + '"'
