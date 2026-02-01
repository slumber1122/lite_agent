#!/usr/bin/env bun
/**
 * Lite agent: same behavior as TUI (uses project AGENTS.md + skills) with server event stream.
 * Always starts an internal opencode server on a new port, then connects to it.
 *
 * Usage:
 *   bun run src/index.ts "your message" [--directory /path/to/project] [--port 4096] [--json] [--agent name] [--model provider/id] [--permission reject|once|always]
 *
 * - directory: project root (default: cwd). Server uses this for AGENTS.md, .opencode/skill/, etc.
 * - port: port for the internal server (default: 0 = any free port).
 * - json: output events as JSON lines.
 * - permission: default response for permission.asked (default: reject).
 */

import path from "node:path"
import { createOpencode, createOpencodeClient, type OpencodeClient } from "@opencode-ai/sdk"

type EventLike = { type: string; properties?: Record<string, unknown> }

const EOL = "\n"

/** Bun adds flush to stdout; Node's types don't include it. */
function flushStdout(): void {
  const s = process.stdout as NodeJS.WriteStream & { flush?: () => void }
  if (typeof s.flush === "function") s.flush()
}

function parseArgs() {
  const argv = process.argv.slice(2)
  const directory =
    argv.find((a) => a.startsWith("--directory="))?.slice("--directory=".length) ?? process.cwd()
  const portArg = argv.find((a) => a.startsWith("--port="))
  const port = portArg ? Number(portArg.slice("--port=".length)) : 0
  const json = argv.includes("--json")
  const agent = argv.find((a) => a.startsWith("--agent="))?.slice("--agent=".length)
  const modelArg = argv.find((a) => a.startsWith("--model="))?.slice("--model=".length)
  const model = modelArg
    ? (() => {
        const [providerID, modelID] = modelArg.split("/")
        return providerID && modelID ? { providerID, modelID } : undefined
      })()
    : undefined
  const permissionArg = argv.find((a) => a.startsWith("--permission="))?.slice("--permission=".length)
  const permission = (permissionArg === "once" || permissionArg === "always" || permissionArg === "reject"
    ? permissionArg
    : "reject") as "once" | "always" | "reject"
  const rest = argv.filter(
    (a) =>
      !a.startsWith("--directory=") &&
      !a.startsWith("--port=") &&
      a !== "--json" &&
      !a.startsWith("--agent=") &&
      !a.startsWith("--model=") &&
      !a.startsWith("--permission="),
  )
  const message = rest.join(" ").trim()
  return { message, directory: path.resolve(directory), port, json, agent, model, permission }
}

function outJson(type: string, data: Record<string, unknown>) {
  process.stdout.write(JSON.stringify({ type, timestamp: Date.now(), ...data }) + EOL)
}

function main() {
  const args = parseArgs()
  if (!args.message) {
    process.stderr.write("Usage: bun run src/index.ts \"message\" [--directory path] [--port N] [--json] [--agent name] [--model provider/id] [--permission reject|once|always]\n")
    process.exit(1)
  }

  const run = async () => {
    const opencode = await createOpencode({ port: args.port, config: {} })
    process.stderr.write(`Server: ${opencode.server.url}\n`)
    const client = createOpencodeClient({ baseUrl: opencode.server.url, directory: args.directory })

    const sessionRes = await client.session.create({ body: { title: "lite-agent" } })
    const sessionData = sessionRes.data
    if (sessionRes.error || !sessionData?.id) {
      process.stderr.write(`session.create failed: ${JSON.stringify(sessionRes.error ?? sessionRes)}${EOL}`)
      process.exit(1)
    }
    const sessionID = sessionData.id

    const events = await client.event.subscribe({})
    const abort = new AbortController()
    const signal = abort.signal

    const done = new Promise<void>((resolve) => {
      ;(async () => {
        try {
        for await (const event of events.stream) {
          if (signal.aborted) break
          const ev = event as EventLike
          const skipBySession =
            ev.type !== "server.connected" &&
            ev.type !== "server.heartbeat" &&
            ev.type !== "message.part.updated" &&
            ev.properties?.sessionID !== sessionID
          if (skipBySession) continue

          if (ev.type === "server.connected") {
            if (args.json) outJson("server.connected", {})
            continue
          }
          if (ev.type === "session.status") {
            const status = ev.properties?.status as { type?: string } | undefined
            if (args.json) outJson("session.status", { sessionID, status })
            if (status?.type === "busy") process.stderr.write("[busy]\n")
            if (status?.type === "idle") process.stderr.write("[idle]\n")
            continue
          }
          if (ev.type === "message.part.updated") {
            const part = ev.properties?.part as
              | { sessionID?: string; type?: string; tool?: string; state?: { status?: string; title?: string; output?: string }; text?: string; time?: { end?: number } }
            if (!part || part.sessionID !== sessionID) continue
            if (part.type === "tool" && part.state?.status === "completed") {
              if (args.json) outJson("tool_use", { part })
              process.stderr.write(`[tool] ${part.tool ?? "?"} - ${part.state?.title ?? ""}\n`)
              if (part.tool === "bash" && part.state?.output?.trim()) process.stderr.write(part.state.output + EOL)
              continue
            }
            if (part.type === "step-start") {
              if (args.json) outJson("step_start", { part })
              continue
            }
            if (part.type === "step-finish") {
              if (args.json) outJson("step_finish", { part })
              continue
            }
            if (part.type === "text" && part.time?.end) {
              if (args.json) outJson("text", { part })
              const text = (part.text ?? "").trim()
              if (text) {
                process.stdout.write(text + EOL)
                flushStdout()
              }
              continue
            }
            continue
          }
          if (ev.type === "session.error") {
            const props = ev.properties as { sessionID?: string; error?: { name?: string; data?: { message?: string } } }
            if (props.sessionID !== sessionID || !props.error) continue
            const err =
              props.error?.data && "message" in props.error.data
                ? String(props.error.data.message)
                : String(props.error?.name ?? "Unknown")
            if (args.json) outJson("error", { error: props.error })
            process.stderr.write(`Error: ${err}\n`)
            abort.abort()
            resolve()
            return
          }
          if (ev.type === "session.idle" && ev.properties?.sessionID === sessionID) {
            if (args.json) outJson("session.idle", { sessionID })
            abort.abort()
            resolve()
            return
          }
          if (ev.type === "permission.asked") {
            const perm = ev.properties as { sessionID?: string; id?: string; permission?: string; patterns?: string[] }
            if (perm.sessionID !== sessionID || !perm.id) continue
            if (args.json) outJson("permission.asked", perm)
            await client.postSessionIdPermissionsPermissionId({
              path: { id: sessionID, permissionID: perm.id },
              body: { response: args.permission },
            })
            continue
          }
        }
        } finally {
          resolve()
        }
      })()
      signal.addEventListener("abort", () => resolve())
    })

    const promptRes = await client.session.prompt({
      path: { id: sessionID },
      body: {
        parts: [{ type: "text", text: args.message }],
        ...(args.agent ? { agent: args.agent } : {}),
        ...(args.model ? { model: args.model } : {}),
      },
    })

    await done
    abort.abort()

    const data = promptRes.data as { info?: unknown; parts?: Array<{ type?: string; text?: string }> } | undefined
    if (promptRes.error) process.stderr.write(`prompt error: ${JSON.stringify(promptRes.error)}${EOL}`)
    if (data && "parts" in data && Array.isArray(data.parts) && data.parts.length > 0 && !args.json) {
      const textParts = data.parts.filter((p: { type?: string; text?: string }) => p.type === "text" && p.text)
      const text = textParts.map((p: { text?: string }) => p.text).join(EOL)
      if (text.trim()) {
        process.stdout.write(text.trim() + EOL)
        flushStdout()
      }
    }
  }

  run().then(
    () => {
      flushStdout()
      setTimeout(() => process.exit(0), 100)
    },
    (err) => {
      process.stderr.write(String(err?.message ?? err) + EOL)
      process.exit(1)
    },
  )
}

main()
