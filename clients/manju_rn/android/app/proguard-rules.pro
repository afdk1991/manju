# 漫剧 Android 端 ProGuard 规则
# 默认保留 React Native 与 Hermes 所需符号；可按需收紧。

-keep class com.manju.** { *; } # 保留本地 OTA 更新模块
-keep class com.facebook.hermes.unicode.** { *; }
-keep class com.facebook.jni.** { *; }
-keep class com.facebook.react.bridge.** { *; }
