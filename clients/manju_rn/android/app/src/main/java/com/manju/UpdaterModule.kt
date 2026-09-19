package com.manju

import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.PackageInstaller
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.provider.Settings
import android.util.Log
import com.facebook.react.bridge.*
import java.io.File

/**
 * OTA 更新原生模块：负责 Android 端的 APK 安装。
 *
 * 红线说明（对应 spec/ota-protocol.v1.md §4）：
 *  - Android **可以**自动安装 APK，但有两个前置条件（缺一不可）：
 *      1) AndroidManifest 声明 REQUEST_INSTALL_PACKAGES 权限；
 *      2) 用户首次授予"允许来自此来源的应用"（canRequestPackageInstalls）。
 *  - 因此 Android 是"**有条件**的自动更新"，不等同于桌面端静默安装：
 *    若未授权，installApk 前必须引导用户去设置页打开，否则 PackageInstaller 会静默失败。
 *  - iOS / HarmonyOS 不会进入本模块；它们的更新在 RN 侧直接跳转商店。
 *
 * JS 侧通道：NativeModules.Updater（见 src/updater/native.ts）。
 */
class UpdaterModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    companion object {
        private const val OTA_ACTION = "com.manju.OTA_INSTALL_STATUS"
    }

    /** 监听系统安装结果（仅用于日志/埋点，安装是否成功以系统弹窗为准）。 */
    private val installReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context?, intent: Intent?) {
            if (intent?.action != OTA_ACTION) return
            val status = intent.getIntExtra(PackageInstaller.EXTRA_STATUS, -1)
            when (status) {
                PackageInstaller.STATUS_PENDING_USER_ACTION -> {
                    // 系统弹出安装确认界面，需在前台 Activity 中启动
                    @Suppress("DEPRECATION")
                    val confirm = intent.getParcelableExtra<Intent>(Intent.EXTRA_INTENT)
                    confirm?.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                    confirm?.let { reactApplicationContext.startActivity(it) }
                }
                PackageInstaller.STATUS_SUCCESS -> Log.i("ManjuUpdater", "APK 安装成功")
                else -> {
                    val msg = intent.getStringExtra(PackageInstaller.EXTRA_STATUS_MESSAGE)
                    Log.e("ManjuUpdater", "APK 安装失败: $status $msg")
                }
            }
        }
    }

    init {
        val filter = IntentFilter(OTA_ACTION)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            reactContext.registerReceiver(installReceiver, filter, Context.RECEIVER_NOT_EXPORTED)
        } else {
            reactContext.registerReceiver(installReceiver, filter)
        }
    }

    override fun getName(): String = "Updater"

    override fun onCatalystInstanceDestroy() {
        super.onCatalystInstanceDestroy()
        try {
            reactContext.unregisterReceiver(installReceiver)
        } catch (_: Exception) {
            // 已注销则忽略
        }
    }

    /**
     * 询问系统：本应用当前是否被允许安装未知来源 APK。
     * 对应 JS：androidCanInstallPackages()
     */
    @ReactMethod
    fun canInstallPackages(promise: Promise) {
        val pm = reactContext.packageManager
        val can = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            pm.canRequestPackageInstalls()
        } else {
            true // Android 8.0 以下无此限制
        }
        promise.resolve(can)
    }

    /**
     * 打开系统设置页，让用户授予"允许安装未知来源应用"权限。
     * 对应 JS：androidOpenInstallSettings()
     */
    @ReactMethod
    fun openInstallPermissionSettings(promise: Promise) {
        try {
            val intent = Intent(
                Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                Uri.parse("package:${reactContext.packageName}")
            ).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            reactContext.startActivity(intent)
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("SETTINGS_FAILED", e.message)
        }
    }

    /**
     * 调起系统安装界面（PackageInstaller 会话安装）。
     * 走到这里说明 APK 已通过 SHA256 + Ed25519 校验。
     * 对应 JS：androidInstallApk({ path })
     */
    @ReactMethod
    fun installApk(params: ReadableMap, promise: Promise) {
        val path = params.getString("path")
        if (path.isNullOrEmpty()) {
            promise.reject("EINVAL", "APK 路径为空")
            return
        }
        val file = File(path)
        if (!file.exists()) {
            promise.reject("ENOENT", "APK 文件不存在: $path")
            return
        }

        val packageInstaller: PackageInstaller = reactContext.packageManager.packageInstaller
        try {
            val sessionParams = PackageInstaller.SessionParams(
                PackageInstaller.SessionParams.MODE_FULL_INSTALL
            )
            val sessionId = packageInstaller.createSession(sessionParams)
            val session = packageInstaller.openSession(sessionId)

            val out = session.openWrite("manju_ota", 0, file.length())
            file.inputStream().use { input ->
                val buffer = ByteArray(8192)
                var read: Int
                while (input.read(buffer).also { read = it } != -1) {
                    out.write(buffer, 0, read)
                }
            }
            session.fsync(out)
            out.close()

            val intent = Intent(reactContext, installReceiver.javaClass).setAction(OTA_ACTION)
            val flags = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                PendingIntent.FLAG_MUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
            } else {
                PendingIntent.FLAG_UPDATE_CURRENT
            }
            val pi = PendingIntent.getBroadcast(reactContext, 0, intent, flags)
            session.commit(pi.intentSender)
            session.close()
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("INSTALL_FAILED", e.message)
        }
    }
}
