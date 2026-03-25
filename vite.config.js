import { defineConfig } from "vite";

import { cloudflare } from "@cloudflare/vite-plugin";

export default defineConfig({
  // Cloudflare Pages 部署阶段会改写 Vite 配置，要求存在 plugins 数组
  plugins: [cloudflare()],
  base: "./",
  server: {
    port: 5173
  },
  build: {
    target: "es2020"
  }
});