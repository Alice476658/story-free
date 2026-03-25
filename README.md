# Story Free Reader (PWA)

一个可免费部署到手机上的 PWA 阅读器：

- 输入/搜索书名（内置少量公版示例书目）
- 支持导入 TXT（粘贴或选择本地文件）
- 阅读全文，自动记录阅读进度（下次打开自动回到上次位置）
- 加入书架、继续阅读
- 离线可用（已打开过的书会被缓存）

## 运行（本地开发）

1. 安装 Node.js（建议 18+ 或 20+）
2. 在本目录执行：

```bash
npm install
npm run dev
```

## 构建（部署用）

```bash
npm run build
```

构建产物在 `dist/`，可直接部署到任意静态托管（Cloudflare Pages / GitHub Pages / Netlify / Vercel Static 等）。

## 手机上“安装”

部署完成后，用手机浏览器打开你的站点：

- Android Chrome：菜单 → “添加到主屏幕”
- iOS Safari：分享 → “添加到主屏幕”

## 版权说明（重要）

本项目不内置受版权保护的现代小说全文。你可以：

- 导入你拥有阅读权的 TXT
- 或阅读公版作品（示例书目链接到公版来源）

