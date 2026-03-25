import { defineConfig } from "vite";

export default defineConfig({
  // Cloudflare Pages 部署阶段会改写 Vite 配置，要求存在 plugins 数组
  plugins: [],
  base: "./",
  server: {
    port: 5173
  },
  build: {
    target: "es2020"
  }
});

