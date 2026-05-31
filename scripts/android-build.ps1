# Сборка Android APK на Windows без symlink (Developer Mode не требуется).
# Использование:
#   powershell -ExecutionPolicy Bypass -File scripts/android-build.ps1
#   powershell -ExecutionPolicy Bypass -File scripts/android-build.ps1 -Release

param(
    [switch]$Release
)

$ErrorActionPreference = "Stop"

$Root = Split-Path $PSScriptRoot -Parent
$SrcTauri = Join-Path $Root "src-tauri"
$GenAndroid = Join-Path $SrcTauri "gen\android"
$JniBase = Join-Path $GenAndroid "app\src\main\jniLibs"

$JavaHome = $env:JAVA_HOME
if (-not $JavaHome -or -not (Test-Path (Join-Path $JavaHome "bin\java.exe"))) {
    $JavaHome = "C:\Program Files\Eclipse Adoptium\jdk-21.0.6.7-hotspot"
}

$SdkRoot = $env:ANDROID_HOME
if (-not $SdkRoot) {
    $SdkRoot = Join-Path $env:LOCALAPPDATA "Android\Sdk"
}

$NdkHome = $env:NDK_HOME
if (-not $NdkHome) {
    $NdkHome = Join-Path $SdkRoot "ndk\26.1.10909125"
}

$env:JAVA_HOME = $JavaHome
$env:ANDROID_HOME = $SdkRoot
$env:ANDROID_SDK_ROOT = $SdkRoot
$env:NDK_HOME = $NdkHome
$env:Path = "$JavaHome\bin;$SdkRoot\platform-tools;$SdkRoot\cmdline-tools\latest\bin;$env:USERPROFILE\.cargo\bin;" + $env:Path

if (-not (Test-Path $GenAndroid)) {
    Write-Error "Android-проект не инициализирован. Выполните: npx tauri android init --ci"
}

$profile = if ($Release) { "release" } else { "debug" }

$targets = [ordered]@{
    "aarch64-linux-android"   = @{ abi = "arm64-v8a"; clang = "aarch64-linux-android34-clang.cmd" }
    "armv7-linux-androideabi" = @{ abi = "armeabi-v7a"; clang = "armv7a-linux-androideabi34-clang.cmd" }
    "i686-linux-android"      = @{ abi = "x86"; clang = "i686-linux-android34-clang.cmd" }
    "x86_64-linux-android"    = @{ abi = "x86_64"; clang = "x86_64-linux-android34-clang.cmd" }
}

$NdkBin = Join-Path $NdkHome "toolchains\llvm\prebuilt\windows-x86_64\bin"

function Set-AndroidTargetEnv {
    param([string]$RustTarget, [string]$ClangName)

    $cc = Join-Path $NdkBin $ClangName
    $cxx = Join-Path $NdkBin ($ClangName -replace '\.cmd$', '++.cmd')
    $ar = Join-Path $NdkBin "llvm-ar.exe"
    $envKey = ($RustTarget -replace '-', '_').ToUpper()

    Set-Item -Path "env:CC_$envKey" -Value $cc
    Set-Item -Path "env:CXX_$envKey" -Value $cxx
    Set-Item -Path "env:AR_$envKey" -Value $ar
    Set-Item -Path "env:CARGO_TARGET_${envKey}_LINKER" -Value $cc
}

Write-Host "==> Frontend build"
Push-Location $Root
npm run build
Pop-Location

Write-Host "==> Rust build ($profile)"
foreach ($entry in $targets.GetEnumerator()) {
    $rustTarget = $entry.Key
    $abi = $entry.Value.abi
    $clang = $entry.Value.clang
    Write-Host "  $rustTarget -> $abi"

    Set-AndroidTargetEnv -RustTarget $rustTarget -ClangName $clang

    Push-Location $SrcTauri
    if ($Release) {
        & cargo build --lib --target $rustTarget --release
    } else {
        & cargo build --lib --target $rustTarget
    }
    if ($LASTEXITCODE -ne 0) { throw "cargo build failed for $rustTarget" }
    Pop-Location

    $libSrc = Join-Path $SrcTauri "target\$rustTarget\$profile\libb9_store_lib.so"
    if (-not (Test-Path $libSrc)) {
        throw "Библиотека не найдена: $libSrc"
    }

    $destDir = Join-Path $JniBase $abi
    New-Item -ItemType Directory -Force -Path $destDir | Out-Null
    Copy-Item $libSrc (Join-Path $destDir "libb9_store_lib.so") -Force
}

Write-Host "==> Patch AndroidManifest"
& (Join-Path $PSScriptRoot "patch-android-manifest.ps1")

Write-Host "==> Gradle assemble"
Push-Location $GenAndroid
$gradleTask = if ($Release) { "assembleUniversalRelease" } else { "assembleUniversalDebug" }
$skipRust = @(
    "-x", "rustBuildUniversalDebug",
    "-x", "rustBuildArm64Debug",
    "-x", "rustBuildArmDebug",
    "-x", "rustBuildX86Debug",
    "-x", "rustBuildX86_64Debug"
)
if ($Release) {
    $skipRust = @(
        "-x", "rustBuildUniversalRelease",
        "-x", "rustBuildArm64Release",
        "-x", "rustBuildArmRelease",
        "-x", "rustBuildX86Release",
        "-x", "rustBuildX86_64Release"
    )
}
& .\gradlew.bat $gradleTask @skipRust
if ($LASTEXITCODE -ne 0) { throw "Gradle build failed" }
Pop-Location

$outDir = Join-Path $GenAndroid "app\build\outputs\apk\universal\$profile"
Write-Host ""
Write-Host "APK готов в: $outDir"
Get-ChildItem $outDir -Filter "*.apk" -ErrorAction SilentlyContinue | ForEach-Object {
    Write-Host "  $($_.FullName) ($([math]::Round($_.Length/1MB, 2)) MB)"
}
