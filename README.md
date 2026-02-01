# lite-agent

轻量 CLI：用户给定一条 message，内部启动 OpenCode server，用 [SDK](https://opencode.ai/docs/sdk/) 与 [Server](https://opencode.ai/docs/server/) 通信，将 server 的返回输出；并暴露关键事件（agent 开始、LLM 步骤、事件流结束）。

- **内部建站**：`createOpencode({ port })` 启动 server，无需用户事先 `opencode serve`。
- **通信**：`createOpencodeClient({ baseUrl, directory })` + `session.create` + `session.prompt` + `event.subscribe()`。
- **输出**：stdout = 最终回复文本；stderr = 关键事件（`[agent] started`、`[llm] step-start/step-finish`、`[session] event stream ended`）；`--json` = 每行一个事件 JSON。
- **设计说明**：[docs/DESIGN.md](docs/DESIGN.md)（需求、SDK/Server 摘要、流程、关键事件映射）。

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

# 详细 JSON 输出（包含完整事件数据、参数和原始事件）
bun run start "Hello" --verbose-json

# 配置回调 URL（所有事件会 POST 到该地址）
bun run start "Hello" --callback-url=https://your-webhook.example.com/events
```

## Options

| Option | Description | Default |
|--------|-------------|---------|
| `--directory=PATH` | Project root (AGENTS.md, .opencode/skill/) | `process.cwd()` |
| `--port=N` | Port for internal server (0 = any free port) | 0 |
| `--json` | Emit events as JSON lines to stderr | off |
| `--verbose-json` | Emit detailed JSON with full event data, args, and raw event | off |
| `--callback=TARGET` | HTTP URL for POST or file path for JSONL append | none |
| `--events=TYPES` | Comma-separated list of event types to output (e.g., `step_start,step_finish,tool_use,text,reasoning,session.idle`) | `step_start,step_finish,tool_use,text,reasoning,session.idle` |
| `--session-name=NAME` | Custom session name for callback identification | auto-generated |
| `--agent=NAME` | Agent to use | config default |
| `--model=PROVIDER/MODEL` | Model override | config default |
| `--permission=reject\|once\|always` | Default for permission.asked | reject |

### JSON Output Modes

**`--json`**: Standard JSON mode outputs structured events as JSON lines to stderr. All events follow a consistent schema:

```json
{"type":"event_name","timestamp":1234567890,"sessionId":"abc-123","data":{...}}
```

**Event Types and Data Structures:**

- **`server.connected`**: Server connection established
  ```json
  {"type":"server.connected","timestamp":1234567890,"sessionId":"abc-123","data":{}}
  ```

- **`session.status`**: Session status change (busy/idle)
  ```json
  {"type":"session.status","timestamp":1234567890,"sessionId":"abc-123","data":{"status":{"type":"busy"}}}
  ```

- **`step_start`**: LLM step started
  ```json
  {"type":"step_start","timestamp":1234567890,"sessionId":"abc-123","data":{"stepType":"start","partType":"step-start"}}
  ```

- **`step_finish`**: LLM step finished
  ```json
  {"type":"step_finish","timestamp":1234567890,"sessionId":"abc-123","data":{"stepType":"finish","partType":"step-finish"}}
  ```

- **`tool_use`**: Tool execution completed
  ```json
  {"type":"tool_use","timestamp":1234567890,"sessionId":"abc-123","data":{"tool":"bash","title":"List files","output":"file1.ts file2.ts","status":"completed"}}
  ```

- **`text_delta`**: Streaming text fragment
  ```json
  {"type":"text_delta","timestamp":1234567890,"sessionId":"abc-123","data":{"delta":"Hello "}}
  ```

- **`text`**: Complete text message
  ```json
  {"type":"text","timestamp":1234567890,"sessionId":"abc-123","data":{"text":"Complete message","partType":"text"}}
  ```

- **`reasoning`**: Reasoning/thinking content
  ```json
  {"type":"reasoning","timestamp":1234567890,"sessionId":"abc-123","data":{"text":"Analyzing the problem...","partType":"reasoning"}}
  ```

- **`error`**: Error occurred
  ```json
  {"type":"error","timestamp":1234567890,"sessionId":"abc-123","data":{"errorName":"ErrorName","errorMessage":"Error description"}}
  ```

- **`session.idle`**: Session ended
  ```json
  {"type":"session.idle","timestamp":1234567890,"sessionId":"abc-123","data":{"hasStreamText":true}}
  ```

- **`permission.asked`**: Permission request
  ```json
  {"type":"permission.asked","timestamp":1234567890,"sessionId":"abc-123","data":{"permissionId":"perm-123","permission":"file.write","patterns":["/path/to/file"]}}
  ```

**`--verbose-json`**: Verbose JSON mode includes full context with raw event data:
```json
{
  "event": "step_finish",
  "timestamp": 1234567890,
  "sessionID": "abc-123",
  "args": {
    "directory": "/path/to/project",
    "agent": "my-agent",
    "model": {"providerID": "openai", "modelID": "gpt-4"},
    "permission": "reject"
  },
  "data": {"stepType": "finish", "partType": "step-finish"},
  "raw": { /* full original event from server */ }
}
```

### Callback (HTTP or File)

The `--callback` parameter supports two modes:

**1. HTTP URL** - Sends events as POST requests:
```bash
bun run start "Hello" --callback=https://api.example.com/webhook
```

Payload structure (use `--session-name` to set custom session_name):
```json
{
  "session_name": "my-custom-session",
  "event": {
    "eventType": "step_finish",
    "timestamp": 1234567890,
    "sessionId": "abc-123",
    "data": {
      "stepType": "finish",
      "partType": "step-finish",
      "sessionID": "abc-123",
      "timestamp": 1234567890
    }
  }
}
```

**2. File Path** - Appends events as JSONL lines:
```bash
bun run start "Hello" --callback=./events.jsonl --session-name=my-session
```

Each event is appended as a new line in JSONL format:
```jsonl
{"session_name":"my-session","event":{"eventType":"step_start","timestamp":1234567890,"sessionId":"abc-123","data":{...}}}
{"session_name":"my-session","event":{"eventType":"step_finish","timestamp":1234567891,"sessionId":"abc-123","data":{...}}}
```

**Note:** Callback receives ALL events regardless of `--events` filter.

### Event Filtering

By default, `--json` only outputs these event types (excludes noisy `text_delta`):
- `step_start`, `step_finish` - LLM execution steps
- `tool_use` - Tool invocations  
- `text` - Complete text messages
- `reasoning` - Reasoning content
- `session.idle` - Session end marker

Use `--events` to customize which events are output:

```bash
# Default behavior (no --events needed)
bun run start "Hello" --json

# Only output step and tool events
bun run start "Analyze code" --json --events=step_start,step_finish,tool_use

# Include all events (including text_delta)
bun run start "Debug" --json --events=step_start,step_finish,tool_use,text,reasoning,text_delta,session.status,session.idle,error,server.connected

# Custom combination
bun run start "Explain this" --json --events=text,reasoning,session.idle
```

**Note:** Callback (`--callback`) always receives ALL events regardless of `--events` filter.

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
