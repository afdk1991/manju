import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Vite 配置：Tauri 要求前端跑在固定端口并关闭文件协议校验。
// 参见 https://v2.tauri.app/start/frontend/vite/
export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    host: false,
    hmr: {
      protocol: "ws",
      host: "localhost",
      port: 1421,
    },
    watch: {
      // 忽略 Rust 侧改动，避免触发无意义的浏览器刷新
      ignored: ["**/src-tauri/**"],
    },
  },
  // 产物仍走相对路径，方便 tauri build 内嵌。
  base: "./",
  build: {
    target: "es2021",
    sourcemap: false,
    outDir: "dist",
  },
});
