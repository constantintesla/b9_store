# Патч подписи release APK для gen/android/app/build.gradle.kts
# Применяется скриптом scripts/configure-release-signing.ps1 после tauri android init

signingConfigs {
    create("release") {
        val propsFile = rootProject.file("keystore/keystore.properties")
        val props = Properties()
        if (propsFile.exists()) {
            propsFile.inputStream().use { props.load(it) }
        }
        storeFile = rootProject.file(props.getProperty("storeFile"))
        storePassword = props.getProperty("storePassword")
        keyAlias = props.getProperty("keyAlias")
        keyPassword = props.getProperty("keyPassword")
    }
}

# В buildTypes.release добавить:
# signingConfig = signingConfigs.getByName("release")
