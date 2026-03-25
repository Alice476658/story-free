# Story Free Reader (PWA)

可免费部署到手机上的 PWA：搜索书目与简介、公版全文（维基文库等）、浏览器搜索链接、书架与阅读进度、备份恢复。

## 运行（本地）

```bash
npm install
npm run dev -- --host
```

手机与电脑同一 Wi‑Fi 时，用终端里 `Network:` 的地址访问。

## 构建

```bash
npm run build
```

产物在 `dist/`。

## 用 GitHub + GitHub Pages 部署（免费个人）

本仓库已包含 **GitHub Actions**（`.github/workflows/deploy-github-pages.yml`），推送 `main` 后会自动构建并发布。

### 你需要做的（一次性）

1. 在 GitHub 网页新建一个空仓库（不要勾选添加 README）。
2. 在本项目目录执行（把 `你的用户名` 和 `仓库名` 换成你的）：

```bash
git remote add origin https://github.com/你的用户名/仓库名.git
git push -u origin main
```

3. 打开仓库 **Settings → Pages**，**Source** 选 **GitHub Actions**（不要选 branch）。
4. 等 **Actions** 里绿色成功后，在 **Settings → Pages** 顶部复制站点地址，一般为：  
   `https://你的用户名.github.io/仓库名/`

### 本地已帮你做好的

- 已执行 `git init`、`main` 分支、首次提交
- 已添加 `.gitignore`（忽略 `node_modules/`、`dist/`）

若你还没建远程仓库，只需在 GitHub 新建仓库后运行上面的 `git remote add` 和 `git push`。

## 手机上“安装”

用浏览器打开部署后的 **https** 地址：

- Android Chrome：菜单 → 添加到主屏幕  
- iOS Safari：分享 → 添加到主屏幕

## 版权说明

应用不自动抓取受版权保护的小说全文；可提供简介、外链与浏览器搜索。
