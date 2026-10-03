package com.manju.manju

import com.manju.UpdaterPlugin
import io.flutter.embedding.android.FlutterActivity
import io.flutter.embedding.engine.FlutterEngine

class MainActivity : FlutterActivity() {

    /**
     * 注册自动更新插件。
     *
     * UpdaterPlugin 同时实现了 ActivityAware —— 安装 APK、查询安装权限
     * 都需要 Activity 上下文，因此必须在这里挂到引擎上，
     * 否则 Dart 侧调用 MethodChannel 会报 MissingPluginException。
     */
    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)
        flutterEngine.plugins.add(UpdaterPlugin())
    }
}
