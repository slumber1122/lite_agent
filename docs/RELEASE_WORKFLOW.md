# 包版本与 Tag 更新流程

发布由 **GitHub 的 tag 自动触发**：推送 `v*` 格式的 tag 后，Actions 自动执行 typecheck、build 并发布到 npm。

---

## 一、一次性配置：GitHub 里填 NPM_TOKEN

1. 打开 [npm Access Tokens](https://www.npmjs.com/account/tokens)，新建 **Automation** 或 **Classic** token，勾选「Publish packages」。
2. 打开你的 GitHub 仓库 → **Settings** → **Secrets and variables** → **Actions**。
3. 新建 **Repository secret**：名称填 `NPM_TOKEN`，值贴刚才复制的 npm token。
4. 保存后，当推送 tag 时，Release 工作流会用该 token 执行 `npm publish`。

---

## 二、版本号规则（SemVer）

| 类型 | 何时用 | 示例 |
|------|--------|------|
| **主版本** major (x.0.0) | 不兼容的 API 或行为变更 | 0.x → 1.0.0 |
| **次版本** minor (0.x.0) | 向后兼容的新功能 | 0.1.0 → 0.2.0 |
| **修订版本** patch (0.0.x) | 向后兼容的 bug 修复、小改动 | 0.0.1 → 0.0.2 |

当前为 `0.0.1`，建议在 1.0 前保持 `0.x.y`，有破坏性变更再考虑升 major。

---

## 三、每次发版流程（tag 触发自动发布）

### 1. 改代码并确认通过

```bash
bun run typecheck
bun run build
```

确认 **CI**（push 到 main 时的 Actions）通过后再发版。

### 2. 升版本并打 tag

**方式 A：用 npm 自动改 version 并打 tag（推荐）**

```bash
# 补丁（0.0.1 → 0.0.2）
npm version patch -m "chore(release): v%s"

# 或次版本（0.0.2 → 0.1.0）
npm version minor -m "chore(release): v%s"

# 或主版本（0.1.0 → 1.0.0）
npm version major -m "chore(release): v%s"
```

会改 `package.json` 的 `version`、生成一条 commit、并创建 tag（如 `v0.0.2`）。

**方式 B：手动改 version 再打 tag**

```bash
# 1. 编辑 package.json，把 "version" 改成目标版本，如 "0.0.2"
# 2. 提交并打 tag
git add package.json
git commit -m "chore(release): v0.0.2"
git tag v0.0.2
```

### 3. 推送代码和 tag

```bash
git push origin main
git push origin v0.0.2
# 或一次推送所有 tag
git push origin --tags
```

### 4. 自动发布

推送 tag 后，**Release** 工作流会自动运行：

- 检出该 tag 对应代码
- 执行 `bun install`、`typecheck`、`build`
- 使用仓库里的 `NPM_TOKEN` 执行 `npm publish`

在仓库 **Actions** 页可查看运行结果；成功后在 npm 上即可看到新版本。

### 5. （可选）在 GitHub 建 Release 说明

- 仓库 → **Releases** → **Create a new release**
- **Choose a tag** 选刚推的 `v0.0.2`
- 填写标题和说明后发布，便于用户查看变更

---

## 四、常用命令速查

| 目的 | 命令 |
|------|------|
| 升 patch 并打 tag | `npm version patch -m "chore(release): v%s"` |
| 升 minor 并打 tag | `npm version minor -m "chore(release): v%s"` |
| 推送代码 + tag（触发自动发布） | `git push origin main && git push origin v0.0.2` 或 `git push origin --tags` |
| 查看当前版本 | `npm version`（无参数）或看 `package.json` |

发布由 **推送 tag** 触发，无需本地再执行 `npm publish`。

---

## 五、npm 的 dist-tag（高级）

默认 `npm publish` 会把版本标为 `latest`。若要做预发布（如 beta）：

```bash
# 发布为 beta，不占 latest
npm version prerelease --preid=beta -m "chore(release): v%s"
npm publish --tag beta
```

用户安装 beta：`npm i lite-agent@beta`。正式版照常 `npm publish`（会更新 `latest`）。

一般小库只维护 `latest` 即可，无需额外 dist-tag。

---

## 六、版本与 Tag 对应关系

| 位置 | 说明 |
|------|------|
| **package.json** `version` | 决定 npm 包版本，必须与 tag 对应（如 tag `v0.0.2` → version `"0.0.2"`） |
| **Git tag** `v*` | 推送后触发 Release 工作流，格式须为 `v` 开头（如 `v0.0.2`） |
| **npm** | 工作流中 `npm publish` 发布当前 `package.json` 的 version |

流程小结：**改代码 → 升 version 并打 tag（如 v0.0.2）→ push 代码和 tag → GitHub Actions 自动发布到 npm**。
