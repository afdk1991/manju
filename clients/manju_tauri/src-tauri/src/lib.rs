// 漫剧 Manju 桌面端（Tauri 2）入口。
//
// 设计要点：
// 1. 仅注册插件与窗口，所有 OTA / 内容中台业务逻辑都放在前端（React）侧，
//    通过 @tauri-apps/api 调用插件能力。这样做的好处是“更新器”逻辑与
//    Flutter / RN 三端共用同一份 JavaScript 契约（见 src/updater/）。
// 2. 真正的静默安装由前端按平台分支触发：
//    - Windows：拉起 MSIX（PackageManager）/ EXE（/VERYSILENT）
//    - macOS：挂载 dmg / 安装 pkg（需开发者签名）
//    - Linux：替换 AppImage / dpkg / tar.gz 自替换
//    具体命令在 src/updater/install.ts 中通过 shell plugin 执行。

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_shell::init())
        // 官方 updater plugin：仅当产物已签名且通过 CDN endpoints 分发时使用。
        // 若改用本项目的“自定义下载 + 安装”流程，可移除该插件（见 README）。
        .plugin(tauri_plugin_updater::Builder::new().build())
        .setup(|app| {
            // 这里可做启动时检查，例如读取 store 中的“跳过版本”记录。
            // 实际检查逻辑由前端在 onMount 时调用 src/updater 完成。
            if cfg!(debug_assertions) {
                let _ = app.handle();
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
