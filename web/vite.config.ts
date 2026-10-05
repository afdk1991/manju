import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: '/manju/',
  plugins: [react()],
  // 静态资产统一放 web/public，构建时整体复制进产物，
  // 避免 outDir 清空导致 files/ api/ external/ 丢失的事故。
  publicDir: 'public',
  build: {
    // 相对 root（web/）解析，等价于项目根下的 makers/static。
    // 该目录在 root 之外，必须显式 emptyOutDir 才会清理旧产物。
    outDir: '../makers/static',
    emptyOutDir: true,
    assetsDir: 'assets',
    chunkSizeWarningLimit: 900,
  },
  server: { port: 5180 },
});
