import { defineConfig } from "vite";
import legacy from "@vitejs/plugin-legacy";

export default defineConfig({
  // Cloudflare 要求存在 plugins 数组；legacy 包可兼容华为等旧版 WebView
  plugins: [
    legacy({
      targets: ["defaults", "Android >= 8", "iOS >= 12", "Chrome >= 61"],
      modernPolyfills: true,
      renderLegacyChunks: true,
    }),
  ],
  base: "./",
  server: {
    port: 5173,
  },
});
