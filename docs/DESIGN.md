# lite-agent 设计说明

基于 [OpenCode SDK](https://opencode.ai/docs/sdk/) 与 [OpenCode Server](https://opencode.ai/docs/server/) 的流程与关键事件设计。

---

## 一、需求

1. **用户输入**：给定一条 message（用户问题或指令）。
2. **内部建站**：在进程内启动一个 OpenCode server（不依赖用户事先运行 `opencode serve`）。
3. **SDK 通信**：用 SDK 与该 server 通信（创建 session、发 prompt、订阅事件）。
4. **输出 server 返回**：将 server 的**最终回复内容**输出（stdout）。
5. **关键事件**：关心并暴露三类事件：
   - **Agent 创建/开始**：agent 开始处理本会话；
   - **LLM 调用**：每次模型推理步骤（开始/结束）；
   - **最终 event 结束**：本轮会话事件流结束（可认为“任务完成”）。

---

## 二、SDK 与 Server 要点（文档摘要）

### 2.1 建站与建客户端（SDK）

- **`createOpencode({ port?, config? })`**  
  同时启动 **server + client**，返回 `{ client, server }`，`server.url` 为本次服务地址。  
  [SDK - Create client](https://opencode.ai/docs/sdk/#create-client)

- **`createOpencodeClient({ baseUrl, directory? })`**  
  仅创建 **client**，连接已有 server。`directory` 为项目根（AGENTS.md、.opencode/skill 等）。  
  [SDK - Client only](https://opencode.ai/docs/sdk/#client-only)

因此：**内部建站**用 `createOpencode()`，**与 server 通信**用 `createOpencodeClient(baseUrl: server.url, directory)`。

### 2.2 会话与发消息（SDK / Server）

- **`session.create({ body: { title? } })`**  
  创建会话，得到 `Session`（含 `id`）。  
  [SDK - Sessions](https://opencode.ai/docs/sdk/#sessions) / [Server - Sessions](https://opencode.ai/docs/server/#sessions)

- **`session.prompt({ path: { id: sessionID }, body: { parts, agent?, model? } })`**  
  向该 session 发一条 prompt。  
  - Server：**POST /session/:id/message** — “Send a message and **wait for response**”，返回 `{ info: Message, parts: Part[] }`。  
  - 即：默认是**阻塞直到有回复**，回复在 `prompt()` 的返回值里。  
  [Server - Messages](https://opencode.ai/docs/server/#messages)

- **`session.messages({ path: { id: sessionID } })`**  
  拉取该 session 的消息列表，用于兜底拿到最终 assistant 文本。  
  [SDK - session.messages](https://opencode.ai/docs/sdk/#sessions)

### 2.3 事件流（SDK / Server）

- **`event.subscribe()`**  
  返回 **SSE 流**，用于实时事件。  
  [SDK - Events](https://opencode.ai/docs/sdk/#events)

- **Server：GET /event**  
  “Server-sent events stream. First event is **server.connected**, then **bus events**.”  
  [Server - Events](https://opencode.ai/docs/server/#events)

事件在流里带 `type` 和 `properties`，例如：`server.connected`、`session.status`、`message.part.updated`、`session.idle`、`permission.asked` 等。

---

## 三、本项目的整体流程

```
用户输入 message
    ↓
createOpencode({ port })  →  内部启动 OpenCode server
    ↓
createOpencodeClient({ baseUrl: server.url, directory })  →  使用该 server
    ↓
session.create({ body: { title: "lite-agent" } })  →  得到 sessionID
    ↓
event.subscribe()  →  订阅全局事件流（按 sessionID 过滤）
    ↓
session.prompt({ path: { id: sessionID }, body: { parts: [{ type: "text", text: message }], ... } })
    ↓
消费事件流直至 session.idle（或错误/流结束）：
  - 关键事件 → 映射为「Agent 开始 / LLM 步骤 / 事件结束」并输出（stderr 或 --json）
  - 文本 / delta → 输出到 stdout（最终回复）
    ↓
可选兜底：session.messages() 取最后一条 assistant 的 text parts → stdout
```

---

## 四、关键事件与映射

| 需求 | 事件 | 说明 |
|------|------|------|
| **Agent 创建/开始** | `session.status` 且 `status.type === "busy"` | 该 session 开始处理（agent 开始工作）。 |
| **LLM 调用** | `message.part.updated` 且 `part.type === "step-start"` | 一次推理步骤开始。 |
| **LLM 调用** | `message.part.updated` 且 `part.type === "step-finish"` | 一次推理步骤结束（含 tokens/cost 等）。 |
| **LLM 调用**（可选） | `message.part.updated` 且 `part.type === "reasoning"` | 推理过程文本（若有）。 |
| **最终 event 结束** | `session.idle` 且 `properties.sessionID === sessionID` | 本会话事件流结束，可认为任务完成。 |

当前实现中：

- **Agent 开始**：收到 `session.status` type `busy` 时打 `[busy]`（可视为 [agent] 开始）。
- **LLM 步骤**：收到 `step-start` / `step-finish` 时打 `step_start` / `step_finish`（--json）或统一为 [llm] 步骤。
- **结束**：收到 `session.idle` 时打 `[idle]` 并结束消费（[session] 结束）。

---

## 五、输出约定

| 输出 | 内容 |
|------|------|
| **stdout** | 仅 **server 的最终回复文本**（message.part.updated 的 text/delta + 兜底 session.messages 的 assistant text）。 |
| **stderr** | 关键事件与进度：`Server: <url>`、`[busy]`/`[idle]`、`[tool]`、可选 `[agent]`/`[llm]`、错误信息。 |
| **--json** | 每行一个 JSON：所有关心的事件（含 type、timestamp、关键字段），便于上层解析。 |

---

## 六、参考链接

- [OpenCode SDK](https://opencode.ai/docs/sdk/) — 安装、createOpencode/createOpencodeClient、Sessions、Events 等。
- [OpenCode Server](https://opencode.ai/docs/server/) — 运行方式、OpenAPI、/session/:id/message、/event 等。
