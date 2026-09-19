package com.manju

import android.app.Application
import com.facebook.react.PackageList
import com.facebook.react.ReactApplication
import com.facebook.react.ReactNativeHost
import com.facebook.react.ReactPackage
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint.load
import com.facebook.react.defaults.DefaultReactNativeHost

/**
 * 应用入口 Application。在 RN 默认包之外手动注册本项目的 UpdaterPackage
 * （用于 OTA 下载后通过 PackageInstaller 会话安装 APK）。
 */
class MainApplication : Application(), ReactApplication {

    private val mReactNativeHost: ReactNativeHost =
        object : DefaultReactNativeHost(this) {
            override fun getUseDeveloperSupport(): Boolean = BuildConfig.DEBUG

            override fun getPackages(): List<ReactPackage> {
                // 自动链接的第三方包
                val packages = PackageList(this).packages
                // 手动注册本地更新模块
                packages.add(UpdaterPackage())
                return packages
            }

            override fun getJSMainModuleName(): String = "index"

            override fun isNewArchEnabled(): Boolean = BuildConfig.IS_NEW_ARCHITECTURE_ENABLED
            override fun isHermesEnabled(): Boolean = BuildConfig.IS_HERMES_ENABLED
        }

    override fun getReactNativeHost(): ReactNativeHost = mReactNativeHost

    override fun onCreate() {
        super.onCreate()
        if (BuildConfig.IS_NEW_ARCHITECTURE_ENABLED) {
            load()
        }
    }
}
