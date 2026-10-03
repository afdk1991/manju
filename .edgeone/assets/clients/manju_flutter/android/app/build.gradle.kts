plugins {
    id("com.android.application")
    // The Flutter Gradle Plugin must be applied after the Android and Kotlin Gradle plugins.
    id("dev.flutter.flutter-gradle-plugin")
}

// 发布签名配置：读取 android/keystore.properties（该文件已 gitignore）。
// 与 RN 端共用同一把密钥（manju-release.keystore），保证两端发布主体一致。
// ⚠️ 更换 keystore 等于更换应用，用户必须卸载重装。
import java.util.Properties

val keystorePropertiesFile = rootProject.file("keystore.properties")
val keystoreProperties = Properties().apply {
    if (keystorePropertiesFile.exists()) {
        keystorePropertiesFile.inputStream().use { load(it) }
    }
}

android {
    namespace = "com.manju.manju"
    compileSdk = flutter.compileSdkVersion
    ndkVersion = flutter.ndkVersion

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    defaultConfig {
        // TODO: Specify your own unique Application ID (https://developer.android.com/studio/build/application-id.html).
        applicationId = "com.manju.manju"
        // You can update the following values to match your application needs.
        // For more information, see: https://flutter.dev/to/review-gradle-config.
        minSdk = flutter.minSdkVersion
        targetSdk = flutter.targetSdkVersion
        // Uses the version code from pubspec.yaml. When using split APKs, 1000 * ABI_VERSION
        // is added automatically by Flutter. (https://developer.android.com/studio/build/configure-apk-splits#configure-APK-versions)
        // You can force using the value of versionCode by specifying the `-P force-version-code-ignoring-abi=true`
        // flag during build.
        versionCode = flutter.versionCode
        versionName = flutter.versionName
    }

    signingConfigs {
        // 仅当 keystore.properties 存在时才注册 release 配置，避免无密钥时静默用 debug 签名。
        if (keystorePropertiesFile.exists()) {
            create("release") {
                storeFile = keystoreProperties["STORE_FILE"]?.let { file(it as String) }
                storePassword = keystoreProperties["STORE_PASSWORD"] as String?
                keyAlias = keystoreProperties["KEY_ALIAS"] as String?
                keyPassword = keystoreProperties["KEY_PASSWORD"] as String?
            }
        }
    }

    buildTypes {
        release {
            // 缺失发布签名时显式失败：debug 签名的 release 包会导致后续无法平滑升级。
            signingConfig = if (keystorePropertiesFile.exists()) {
                signingConfigs.getByName("release")
            } else {
                throw GradleException(
                    "缺少 ${keystorePropertiesFile}：release 构建需要发布签名配置。" +
                    "请复制 keystore.properties.example 并填入真实密钥，或在 CI 中注入。"
                )
            }
        }
    }
}

kotlin {
    compilerOptions {
        jvmTarget = org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17
    }
}

flutter {
    source = "../.."
}

dependencies {
    // 自动更新相关：
    // - FileProvider：把下载目录中的 APK 以 content:// 形式授权给系统安装器
    //   （Android 7.0+ 禁止跨应用传递 file:// URI）
    // - PackageInstaller API 所需的兼容类
    implementation("androidx.core:core-ktx:1.13.1")
}
