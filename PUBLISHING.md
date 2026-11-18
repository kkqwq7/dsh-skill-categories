# DSH 技能分类中心 · GitHub 开源源码流程

> 目标仓库示例：`https://github.com/YOUR_NAME/dsh-skill-categories`  
> 收录公告：[awesome-dsh-plugin/contributing.md](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin/blob/main/contributing.md)

## 0. 先修正当前项目（开源前）

当前目录：`<项目目录>`

1. **包名与可见性**：`package.json` 已使用公开包名 `dsh-skill-categories`，`private` 已设为 `false`；如需使用 npm scope，可改为 `@YOUR_NAME/dsh-skill-categories`。
2. **同步 4 处包名引用**：
   - `package.json` 的 `name`
   - `cordis.patch.yml` 的 `name`
   - `client.js` 第 9 行 `window.__ModuleLoader__.load({ id: ... })`
   - `client.js` 的 `NS` / `CSS_TAG`（第 16、342、353 行附近）
3. **README 已更新**：截图使用无侧栏的主面板裁切图 `./assets/screenshots/panel-overview.png`，技能数按当前实际数量 **116** 写。
4. **补 `repository` 等元数据**：`repository`、`homepage`、`bugs`、`author`。
5. **准备市场素材**：`assets/icon-180.png`（180×180、PNG，不能是 SVG）、`assets/screenshots/` 下 1–8 张截图、根目录 `screenshots.json`。
6. **不要提交**：`video-kit/`、`DSH技能分类中心-视频素材包/`、`_chrome*`、临时 `trial-*.png`、`final-clean.png` 等草稿。它们不属于插件源码仓库。

## 1. 整理成可安装的 GitHub 仓库

`package.json` 至少应包含下面这些字段（当前已有 `dsh.bundle`，这是收录的硬条件）：

```jsonc
{
  "name": "dsh-skill-categories",
  "version": "0.1.0",
  "private": false,
  "description": "Browse, search, and drag-to-group DSH skills by category from a sidebar panel; categories are shared with skill-hub.",
  "repository": {
    "type": "git",
    "url": "git+https://github.com/YOUR_NAME/dsh-skill-categories.git"
  },
  "homepage": "https://github.com/YOUR_NAME/dsh-skill-categories",
  "bugs": {
    "url": "https://github.com/YOUR_NAME/dsh-skill-categories/issues"
  },
  "dsh": {
    "engines": { "dsh": ">=0.2.1-rc.3" },
    "bundle": { "patch": "./cordis.patch.yml" },
    "client": {
      "platform": "web",
      "immediately": true,
      "inject": [
        "@deepseek-ai/dsh-client-locale",
        "@deepseek-ai/dsh-client-ui-layout"
      ]
    }
  }
}
```

仓库根目录 `cordis.patch.yml` 必须和包名对上：

```yaml
- insert:
    - id: skill-categories
      name: 'dsh-skill-categories'
```

添加 `.gitignore`：

```gitignore
node_modules/
video-kit/
*.zip
_chrome*/
*.log
trial-*.png
final-clean.png
final-panel.png
```

添加 `screenshots.json`（路径相对本文件，不能跳出插件目录）：

```json
[
  "assets/screenshots/panel-overview.png",
  "assets/screenshots/category-expanded.png"
]
```

可以从现有素材复制截图：

```powershell
cd <项目目录>
New-Item -ItemType Directory -Force assets\screenshots | Out-Null
Copy-Item <截图源文件> assets\screenshots\panel-overview.png
Copy-Item <截图源文件2> assets\screenshots\category-expanded.png
```

`icon-180.png` 可以用 Chrome 从 `icon.svg` 截：

```powershell
& '<Chrome路径>' `
  --headless=new --disable-gpu --hide-scrollbars `
  --window-size=180,180 --force-device-scale-factor=1 `
  --screenshot=<项目目录>\assets\icon-180.png `
  file:///<项目目录>/icon.svg
```

## 2. 建 GitHub 仓库

```powershell
cd <项目目录>
git init
git add .
git commit -m "feat: initial DSH skill categories plugin"

# 如果装了 GitHub CLI：
gh repo create YOUR_NAME/dsh-skill-categories --public --source . --remote origin --push

# 给仓库加 topic，收录会检查
gh repo edit YOUR_NAME/dsh-skill-categories --add-topic dsh-plugin
```

没装 `gh` 就在 GitHub 网页新建仓库，再执行：

```powershell
git remote add origin https://github.com/YOUR_NAME/dsh-skill-categories.git
git branch -M main
git push -u origin main
```

**注意：awesome-dsh-plugin 要求仓库创建满 1 天**才能提交收录；今天建仓，明天再提 PR。

## 3. 做 Release（建议）或发 npm

### 3A. GitHub Release + 预构建 tarball（不发 npm 也能收录）

```powershell
cd <项目目录>
npm pack
# 产物：dsh-skill-categories-0.1.0.tgz
Copy-Item .\dsh-skill-categories-0.1.0.tgz .\dsh-skill-categories.tgz
gh release create v0.1.0 .\dsh-skill-categories.tgz `
  --title "v0.1.0" --notes "Initial release: DSH skill categories sidebar plugin."
```

收录条目里可以加：

```yaml
tarball: https://github.com/YOUR_NAME/dsh-skill-categories/releases/latest/download/dsh-skill-categories.tgz
```

`latest/download/` 只解析 `latest`，文件名按字面取；所以 asset 名不要带版本号（上面这个 `dsh-skill-categories.tgz` 就是稳定名）。

### 3B. 发布 npm（可选，但安装体验最好）

```powershell
npm login
npm publish --access public
```

只有你准备发 npm 时才把 `private` 设为 `false`；包名是 `@YOUR_NAME/dsh-skill-categories` 时，`npm publish --access public` 必须带 `--access public`。

## 4. 向 awesome-dsh-plugin 提交收录

1. Fork `awesome-dsh-plugin/awesome-dsh-plugin`。
2. **只新增一个文件**：
   `data/plugins/YOUR_NAME__dsh-skill-categories.yml`

内容模板（`category: ui` 最贴近这个插件；维护者可以改分类，不会因此打回）：

```yaml
url: https://github.com/YOUR_NAME/dsh-skill-categories
name: YOUR_NAME/dsh-skill-categories
category: ui
description:
  en: "Browse, search, and drag-to-group DSH skills by category from a sidebar panel, with categories shared with skill-hub."
  zh: "在侧栏按分类折叠浏览、搜索全部 DSH 技能，支持拖拽归类和分类管理，并与 skill-hub 共享分类数据。"
icon: https://raw.githubusercontent.com/YOUR_NAME/dsh-skill-categories/main/assets/icon-180.png
# tarball: https://github.com/YOUR_NAME/dsh-skill-categories/releases/latest/download/dsh-skill-categories.tgz
```

提交 PR 时：
- PR 标题：`Add YOUR_NAME/dsh-skill-categories`
- **不要手工改 README**，列表由 `data/plugins/*.yml` 自动生成。
- 一个 PR 最多 3 条 entry；你只有 1 条，符合。
- 如果你的描述里出现 `: `（冒号+空格），YAML 必须加引号。
- 描述只说功能，不要写“最强 / 唯一 / 颠覆”等营销词；描述里的每个数字和 API 名称都要能被代码核对。

## 5. CI 会检查什么

1. `dsh.bundle` 出现在仓库 `package.json` 里（只有 `dsh.client` 会被拒）
2. 仓库创建满 1 天
3. `awesome-lint` / 站点构建 / README 可重新生成
4. PR 最多 3 个 entry

## 6. 合并后

- 不要修改生成后的 README；以后更新条目只改你自己的 `data/plugins/YOUR_NAME__dsh-skill-categories.yml`。
- 插件停止维护、仓库删除或归档，会被定期扫描并移除。
- 想更新截图，推自己仓库的 `screenshots.json` 即可，不需要再来提 PR。

## 最小可收录版本（赶时间版）

只要做到这 5 件事就能提交：

1. 仓库里有真实可用的 `index.js` / `client.js`
2. `package.json` 有 `dsh.bundle` + `cordis.patch.yml`
3. 仓库创建满 1 天
4. 仓库添加 `dsh-plugin` topic
5. PR 只加 `data/plugins/YOUR_NAME__dsh-skill-categories.yml`

npm 和 Release tarball 都不是收录硬条件，只是让安装体验更好。
