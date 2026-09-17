// 程序入口：仅把控制权交给 Tauri 运行时。
// 真实逻辑放在 lib.rs 的 `run()` 中，便于集成测试与热重载。

#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    manju_tauri_lib::run()
}
