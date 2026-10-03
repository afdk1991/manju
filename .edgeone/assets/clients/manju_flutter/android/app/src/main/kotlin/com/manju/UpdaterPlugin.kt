package com.manju

import android.content.Intent
import android.content.pm.PackageInstaller
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.provider.Settings
import androidx.core.content.FileProvider
import io.flutter.embedding.engine.plugins.FlutterPlugin
import io.flutter.embedding.engine.plugins.activity.ActivityAware
import io.flutter.embedding.engine.plugins.activity.ActivityPluginBinding
import io.flutter.plugin.common.MethodCall
import io.flutter.plugin.common.MethodChannel
import io.flutter.plugin.common.MethodChannel.MethodCallHandler
import io.flutter.plugin.common.MethodChannel.Result
import java.io.File
import java.io.FileInputStream

/**
 * 自动更新所需的 Android 原生能力。
 *
 * 通道名与方法名须与 Dart 侧 `android_updater.dart` 保持一致：
 *   - canInstallPackages              查询是否已获"未知来源"安装授权
 *   - openInstallPermissionSettings   跳转系统授权页
 *   - installApk                      通过 PackageInstaller 会话安装 APK
 *
 * 说明：
 * Android 8.0（API 26）起，直接使用 ACTION_VIEW 隐式 Intent 安装已被限制，
 * 必须声明 REQUEST_INSTALL_PACKAGES 权限并通过 PackageInstaller 会话安装。
 */
class UpdaterPlugin : FlutterPlugin, MethodCallHandler, ActivityAware {

    private lateinit var channel: MethodChannel
    private var activityBinding: ActivityPluginBinding? = null

    companion object {
        private const val CHANNEL_NAME = "com.manju/updater"
        private const val INSTALL_REQUEST_CODE = 20260
    }

    override fun onAttachedToEngine(binding: FlutterPlugin.FlutterPluginBinding) {
        channel = MethodChannel(binding.binaryMessenger, CHANNEL_NAME)
        channel.setMethodCallHandler(this)
    }

    override fun onDetachedFromEngine(binding: FlutterPlugin.FlutterPluginBinding) {
        channel.setMethodCallHandler(null)
    }

    override fun onAttachedToActivity(binding: ActivityPluginBinding) {
        activityBinding = binding
    }

    override fun onDetachedFromActivityForConfigChanges() {
        activityBinding = null
    }

    override fun onReattachedToActivityForConfigChanges(binding: ActivityPluginBinding) {
        activityBinding = binding
    }

    override fun onDetachedFromActivity() {
        activityBinding = null
    }

    override fun onMethodCall(call: MethodCall, result: Result) {
        when (call.method) {
            "canInstallPackages" -> result.success(canInstallPackages())
            "openInstallPermissionSettings" -> {
                result.success(openInstallPermissionSettings())
            }
            "installApk" -> {
                val path = call.argument<String>("path")
                if (path.isNullOrEmpty()) {
                    result.error("INVALID_ARGUMENT", "path 为空", null)
                    return
                }
                try {
                    installApk(path)
                    // 系统安装界面是异步的，这里只能确认"已成功提交安装会话"
                    result.success(true)
                } catch (e: Exception) {
                    result.error("INSTALL_FAILED", e.message, null)
                }
            }
            else -> result.notImplemented()
        }
    }

    /** 是否已被允许安装未知来源应用。API 26 以下默认允许。 */
    private fun canInstallPackages(): Boolean {
        val context = activityBinding?.activity ?: return false
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return true
        return context.packageManager.canRequestPackageInstalls()
    }

    /** 跳转到"允许来自此来源的应用"设置页。 */
    private fun openInstallPermissionSettings(): Boolean {
        val context = activityBinding?.activity ?: return false
        return try {
            val intent = Intent(
                Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                Uri.parse("package:${context.packageName}")
            )
            context.startActivity(intent)
            true
        } catch (e: Exception) {
            false
        }
    }

    /**
     * 通过 PackageInstaller 会话安装 APK。
     *
     * 调用前 Dart 侧已完成 SHA256 与 Ed25519 校验，
     * 这里只负责把可信文件交给系统安装器。
     */
    private fun installApk(apkPath: String) {
        val context = activityBinding?.activity ?: throw IllegalStateException("Activity 未就绪")
        val apkFile = File(apkPath)
        if (!apkFile.exists()) throw IllegalArgumentException("APK 不存在：$apkPath")

        val packageInstaller = context.packageManager.packageInstaller

        val params = PackageInstaller.SessionParams(
            PackageInstaller.SessionParams.MODE_FULL_INSTALL
        )
        // Android 14+ 需要显式指定目标 SDK，否则部分 ROM 会拒绝
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            params.setRequireUserAction(PackageInstaller.SessionParams.USER_ACTION_NOT_REQUIRED)
        }

        val sessionId = packageInstaller.createSession(params)
        val session = packageInstaller.openSession(sessionId)

        session.use { s ->
            FileInputStream(apkFile).use { input ->
                s.openWrite("manju_update", 0, apkFile.length()).use { output ->
                    val buffer = ByteArray(64 * 1024)
                    var read: Int
                    while (input.read(buffer).also { read = it } != -1) {
                        s.fsync(output)
                        output.write(buffer, 0, read)
                    }
                    s.fsync(output)
                }
            }

            // 提交会话，系统弹出安装确认界面
            val intent = Intent(context, context.javaClass).apply {
                action = "com.manju.INSTALL_COMMIT"
            }
            val pendingIntent = android.app.PendingIntent.getActivity(
                context,
                INSTALL_REQUEST_CODE,
                intent,
                android.app.PendingIntent.FLAG_UPDATE_CURRENT or
                    (if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M)
                        android.app.PendingIntent.FLAG_IMMUTABLE else 0)
            )
            s.commit(pendingIntent.intentSender)
        }
    }
}
