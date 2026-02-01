# lite-agent

Lightweight agent that uses the OpenCode SDK with the same project context as TUI (AGENTS.md, `.opencode/skill/`, etc.) and subscribes to server events. **Always starts an internal opencode server on a new port**, then connects to it.

## 快速开始 / Quick Start

**独立使用本仓库**：克隆后即可安装运行，无需 monorepo。

```bash
# 1. 克隆并进入项目（请将 你的用户名 换成实际 GitHub 用户名）
git clone https://github.com/你的用户名/lite_agent.git lite_agent && cd lite_agent

# 2. 安装依赖（Bun / npm / pnpm 均可）
bun install

# 3. 发一条消息（会用当前目录作为项目，内部自动起 server）
bun run start "列出当前目录下的文件"
# 或
bun run dev "你的消息"
```

## 怎么使用 / Usage

```bash
# 用当前目录做项目
bun run start "列出 src 下的文件"

# 指定项目目录（会读该目录的 AGENTS.md、.opencode/skill/）
bun run start "Refactor foo" --directory=/path/to/your/project

# 指定端口（默认 0 = 自动选空闲端口）
bun run start "Hello" --port=4096

# 事件以 JSON 行输出
bun run start "Hello" --json
```

## Options

| Option | Description | Default |
|--------|-------------|---------|
| `--directory=PATH` | Project root (AGENTS.md, .opencode/skill/) | `process.cwd()` |
| `--port=N` | Port for internal server (0 = any free port) | 0 |
| `--json` | Emit events as JSON lines to stdout | off |
| `--agent=NAME` | Agent to use | config default |
| `--model=PROVIDER/MODEL` | Model override | config default |
| `--permission=reject\|once\|always` | Default for permission.asked | reject |

## Build & Publish

**发布前需**：在 [npmjs.com](https://www.npmjs.com/signup) 注册账号，本地执行 `npm login` 登录。

- **发布前完整检查**：见 [docs/PRE_PUBLISH_CHECKLIST.md](docs/PRE_PUBLISH_CHECKLIST.md)（项目分析、依赖、发布清单）
- **版本与发布流程**：见 [docs/RELEASE_WORKFLOW.md](docs/RELEASE_WORKFLOW.md)（**由 GitHub tag 自动触发发布**：配置 `NPM_TOKEN` 后，推送 `v*` tag 即自动发布到 npm）

```bash
# 本地构建
bun run build

# 发布：推送 tag 后由 GitHub Actions 自动执行 npm publish（需在仓库 Secrets 中配置 NPM_TOKEN）
# 或首次/手动发布：npm publish
npm publish
```

若包名 `lite-agent` 已被占用，可改为 `@你的用户名/lite-agent` 或换一个未占用的名字再发布。

发布后用户可安装为全局 CLI：`bunx lite-agent "消息"` 或 `npm install -g lite-agent` 后使用 `lite-agent "消息"`。

## 托管到 GitHub

若你要把本项目建到自己的 GitHub：本地 `git init` → 在 GitHub 新建空仓库 → `git remote add origin <你的仓库地址>` → `git push -u origin main`。  
完整步骤见 [docs/GITHUB_SETUP.md](docs/GITHUB_SETUP.md)。

## Requirements

- **[Bun](https://bun.sh)**（推荐）或 Node.js 18+（用 `npm install` / `npm run start` 亦可）
- **OpenCode**：程序通过 `@opencode-ai/sdk` 的 `createOpencode()` 在内部启动 server，使用前请先安装并配置 [OpenCode](https://opencode.ai)
