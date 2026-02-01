# 发布前完整项目分析

## 一、项目结构

```
lite_agent/
├── .github/workflows/ci.yml   # CI：typecheck + build
├── .gitignore
├── .opencode/opencode.json
├── docs/
│   ├── GITHUB_SETUP.md       # GitHub 托管步骤
│   ├── PRE_PUBLISH_CHECKLIST.md  # 本文件
│   └── RELEASE_WORKFLOW.md   # 版本与 tag 流程
├── LICENSE                   # MIT
├── package.json
├── README.md
├── src/index.ts              # 入口
├── tsconfig.json
└── bun.lock
```

| 类型 | 说明 |
|------|------|
| 入口 | `src/index.ts`（shebang `#!/usr/bin/env bun`，可执行） |
| 构建产物 | `dist/index.js`（单文件 bundle，由 `bun run build` 生成） |
| 发布内容 | 仅 `dist` + `README.md`（由 `package.json` 的 `files` 控制） |

---

## 二、依赖与脚本

### 生产依赖

| 包 | 版本 | 说明 |
|----|------|------|
| @opencode-ai/sdk | ^1.1.28 | OpenCode 客户端，createOpencode / createOpencodeClient |

### 开发依赖

| 包 | 版本 | 说明 |
|----|------|------|
| @tsconfig/bun | ^1.0.10 | Bun 用 TS 配置 |
| @types/node | ^22.0.0 | Node 类型 |
| typescript | ^5.6.0 | 仅 typecheck，不参与 build |

### 脚本

| 脚本 | 作用 |
|------|------|
| build | `bun build src/index.ts --outdir=dist --target=bun`，产出可执行 bundle |
| dev / start / run | 直接跑 `src/index.ts` |
| typecheck | `tsc --noEmit` |
| prepublishOnly | 在 `npm publish` 前自动执行 `bun run build` |

---

## 三、发布相关配置（package.json）

| 字段 | 值 | 说明 |
|------|-----|------|
| name | lite-agent | 包名（npm 上已确认未被占用） |
| version | 0.0.1 | 当前版本，发布后按 [RELEASE_WORKFLOW.md](RELEASE_WORKFLOW.md) 维护 |
| main | dist/index.js | 包入口 |
| bin | lite-agent → dist/index.js | 全局安装后的 CLI 命令 |
| files | dist, README.md | 只发布这些，不发布 src、node_modules 等 |
| license | MIT | 与 LICENSE 文件一致 |
| engines | bun >= 1.0 | 运行时要求 |

---

## 四、发布前检查清单

- [ ] **本地通过**
  - [ ] `bun install`
  - [ ] `bun run typecheck` 通过
  - [ ] `bun run build` 成功，且 `dist/index.js` 存在且含 shebang
- [ ] **npm 登录**
  - [ ] `npm whoami` 显示你的用户名
  - [ ] 若曾用国内镜像，已切回官方：`npm config set registry https://registry.npmjs.org/`
- [ ] **包名**
  - [ ] `npm view lite-agent` 返回 404（名字可用）
- [ ] **README**
  - [ ] 克隆地址已改为你的 GitHub 用户名（或保留占位符，发布后再改）
- [ ] **版本号**
  - [ ] 首次发布用 `0.0.1` 即可；后续按 [RELEASE_WORKFLOW.md](RELEASE_WORKFLOW.md) 升版本

---

## 五、已知约定与风险

| 项 | 说明 |
|----|------|
| 运行时 | 依赖 Bun（shebang、flush 等），不保证在纯 Node 下行为一致 |
| 锁文件 | 已提交 `bun.lock`，保证安装可复现 |
| CI | 每次 push/PR 会跑 typecheck + build，发布前建议确认 Actions 绿 |
| 未发布内容 | `.github`、`docs`、`src`、`tsconfig.json` 等不在 `files` 里，不会进 npm 包，只在 GitHub 可见 |

---

## 六、首次发布命令

确认上述清单后，在项目根目录执行：

```bash
npm publish
```

`prepublishOnly` 会自动执行 `bun run build`，无需先手动 build。发布成功后，用户可：

- `npm install -g lite-agent` 或 `bunx lite-agent "消息"`
