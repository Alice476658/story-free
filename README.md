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

## Cloudflare Pages（国内手机访问常更稳定）

连接 GitHub 仓库时建议这样配：

| 项 | 值 |
|----|-----|
| Framework preset | **None** |
| Build command | `npm run build` |
| Build output directory | **`dist`** |

**环境变量**（可选但推荐）：`NODE_VERSION` = `20`

若 **构建成功** 但 **「Deploying to Cloudflare's global network」失败**：

1. 打开该次部署 → 展开 **Deploying** 步骤，把**红色报错全文**复制下来（或截图）。  
2. 在 Cloudflare 控制台确认 **邮箱已验证**、账号无欠费/风控提示。  
3. 点 **Retry deployment** 重试（有时是临时网络问题）。  
4. 仍失败：用 **Workers & Pages → 你的项目 → Create deployment → Upload assets**，把本地 `npm run build` 生成的 **`dist` 文件夹** 整包拖上去发布（不经过 Git 构建）。

## 手机上“安装”

用浏览器打开部署后的 **https** 地址：

- Android Chrome：菜单 → 添加到主屏幕  
- iOS Safari：分享 → 添加到主屏幕

## 版权说明

应用不自动抓取受版权保护的小说全文；可提供简介、外链与浏览器搜索。
