# B9 Store POS

Десктопный и **мобильный** POS-терминал магазина на **Tauri 2 + React + TypeScript** с локальной SQLite.

## Возможности

- **Касса** — продажа по QR паспорта покупателя + штрихкоды товаров
- **Товары** — CRUD, добавление по сканированию штрихкода
- **Добавление товаров** — название, цена, сканирование штрихкодов/QR, сохранение
- **Покупатели** — импорт реестра из `b9_docs/registry.db`
- **Аналитика** — KPI и графики (Recharts)
- **Синхронизация** — выгрузка продаж на `https://preshevkadastr.ru/store`
- **Android** — нижняя навигация, сканирование камерой (QR + штрихкоды)

## Требования

### Desktop (Windows)
- Node.js 20+
- Rust (rustup)
- WebView2

### Android (сборка APK)
- JDK 17+ (рекомендуется Eclipse Temurin 21)
- Android SDK + NDK 26.1 (`scripts/setup-android.ps1`)
- Rust targets: `aarch64-linux-android`, `armv7-linux-androideabi`, `i686-linux-android`, `x86_64-linux-android`

Переменные окружения:
```powershell
$env:JAVA_HOME = "C:\Program Files\Eclipse Adoptium\jdk-21.0.6.7-hotspot"
$env:ANDROID_HOME = "$env:LOCALAPPDATA\Android\Sdk"
$env:NDK_HOME = "$env:ANDROID_HOME\ndk\26.1.10909125"
```

## Запуск (desktop)

```bash
cd c:\projects\b9_store
npm install
npm run tauri dev
```

## Сборка Windows exe

```bash
npm run tauri build
```

## Сборка Android APK

### Первичная настройка (один раз)

```powershell
cd c:\projects\b9_store
npm install
npm run android:setup          # SDK + NDK
npx tauri android init --ci    # gen/android/
powershell -ExecutionPolicy Bypass -File scripts/patch-android-manifest.ps1
powershell -ExecutionPolicy Bypass -File scripts/create-release-keystore.ps1
```

> На Windows без **Developer Mode** стандартный `tauri android build` падает на symlink. Используйте `scripts/android-build.ps1` — он копирует `.so` вместо symlink.

### Debug APK (быстрая проверка)

```powershell
npm run android:build
```

APK (arm64, ~30–45 МБ): `src-tauri\gen\android\app\build\outputs\apk\arm64\debug\app-arm64-debug.apk`

Сборка со всеми ABI (эмулятор + старые телефоны): `npm run android:build:universal`

> Раньше universal debug APK раздувался до ~500+ МБ из‑за `keepDebugSymbols` и выравнивания 16KB. Скрипт `patch-android-gradle.ps1` это отключает.

### Release APK (для касс)

```powershell
npm run android:build:release
```

APK: `src-tauri\gen\android\app\build\outputs\apk\arm64\release\app-arm64-release.apk`

### Установка на телефон (sideload)

1. Скопируйте APK на телефон (USB, Telegram, и т.д.)
2. **Настройки → Безопасность → Неизвестные источники** — разрешить установку
3. Откройте APK и установите
4. При первом сканировании разрешите **доступ к камере**

Keystore для release (не коммитится): `src-tauri/gen/android/keystore/`.  
Шаблон: `keystore.properties.example`. Создание: `scripts/create-release-keystore.ps1`  
(пароль генерируется случайно или задаётся через `$env:B9_KEYSTORE_PASSWORD`).

## Публикация на GitHub

```powershell
cd c:\projects\b9_store
git init
git add .
git commit -m "Initial commit: B9 Store POS (Tauri desktop + Android)"
git branch -M main
git remote add origin https://github.com/YOUR_ORG/b9_store.git
git push -u origin main
```

В репозиторий **не попадают**: `node_modules/`, `dist/`, `src-tauri/target/`, Android build/APK, keystore, локальные `.db`.

## Первичная настройка приложения

1. **Покупатели** → «Импорт registry.db» → выберите `c:\projects\b9_docs\registry.db`
   - На Android файл читается через SAF и импортируется через `import_citizens_from_bytes`
2. **Товары** → добавьте позиции (можно сканировать штрихкод или камеру на телефоне)
3. На сервере: `https://preshevkadastr.ru/store` → войти как `superadmin` → **Устройства** → создать device-token
4. **Настройки** → вставить token и URL сервера → «Выгрузить продажи»

## Горячие клавиши (касса, desktop)

- **F2** — фокус на поле покупателя (QR)
- **F4** — фокус на поле товара (штрихкод)
- USB-сканер работает как клавиатура (завершение Enter)

## Мобильный UX

- Нижняя навигация: **Касса**, **Добавить**, **Товары**, **Ещё** (Покупатели, Аналитика, Настройки)
- Кнопки «Сканировать паспорт» / «Сканировать товар» на кассе
- Камера: `html5-qrcode` (QR + EAN/Code128)

## Связанные проекты

- `c:\projects\b9_docs` — реестр граждан
- `c:\projects\msrv_b9_kadastr\store` — веб-панель и API синхронизации

