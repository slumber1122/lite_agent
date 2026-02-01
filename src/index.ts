#!/usr/bin/env bun
/**
 * Lite agent: same behavior as TUI (uses project AGENTS.md + skills) with server event stream.
 * Spawns an OpenCode server in a subprocess, then connects with a client and streams events.
 *
 * Usage:
 *   bun run src/index.ts "your message" [--directory /path/to/project] [--port N] [--json] [--verbose-json] [--callback TARGET] [--events type1,type2,...] [--session-name NAME] [--agent name] [--model provider/id] [--permission reject|once|always]
 *
 * - directory: project root (default: cwd). Sent as x-opencode-directory for AGENTS.md, .opencode/skill/, etc.
 * - port: port for the spawned server (default: 0 = any free port).
 * - json: output events as JSON lines to stderr.
 * - verbose-json: output detailed JSON with full event data, args, and raw event to stderr.
 * - callback: URL for HTTP POST or file path for JSONL append (e.g., https://api.example.com/webhook or ./events.jsonl).
 * - events: comma-separated list of event types to output (e.g., step_start,step_finish,tool_use,text,reasoning,session.idle).
 * - session-name: custom session name for callback identification.
 * - permission: default response for permission.asked (default: reject).
 */

import path from "node:path";
import fs from "node:fs/promises";
import { createOpencode, createOpencodeClient } from "@opencode-ai/sdk";

/**
 * Check if a string is a URL (http/https)
 */
function isUrl(str: string): boolean {
  return str.startsWith("http://") || str.startsWith("https://");
}

async function sendCallback(
  callbackTarget: string,
  sessionName: string | undefined,
  eventType: string,
  data: Record<string, unknown>
): Promise<void> {
  try {
    const eventPayload = {
      eventType,
      timestamp: Date.now(),
      sessionId: data.sessionID,
      data,
    };

    const payload = {
      session_name: sessionName ?? "unknown",
      event: eventPayload,
    };

    if (isUrl(callbackTarget)) {
      const response = await fetch(callbackTarget, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        process.stderr.write(`[callback-error] Failed to send ${eventType}: ${response.status} ${response.statusText}${EOL}`);
      }
    } else {
      const jsonlLine = JSON.stringify(payload) + "\n";
      await fs.appendFile(callbackTarget, jsonlLine);
    }
  } catch (err) {
    process.stderr.write(`[callback-error] ${eventType}: ${String(err)}${EOL}`);
  }
}

const EOL = "\n";

/** Bun adds flush to stdout; Node's types don't include it. */
function flushStdout(): void {
  const s = process.stdout as NodeJS.WriteStream & { flush?: () => void };
  if (typeof s.flush === "function") s.flush();
}

interface ParsedArgs {
  message: string;
  directory: string;
  port: number;
  json: boolean;
  verboseJson: boolean;
  callback: string | undefined;
  events: string[] | undefined;
  sessionName: string | undefined;
  agent: string | undefined;
  model: { providerID: string; modelID: string } | undefined;
  permission: "once" | "always" | "reject";
}

function parseArgs(): ParsedArgs {
  const argv = process.argv.slice(2);
  const directory =
    argv.find((a) => a.startsWith("--directory="))?.slice("--directory=".length) ?? process.cwd();
  const portArg = argv.find((a) => a.startsWith("--port="));
  const port = portArg ? Number(portArg.slice("--port=".length)) : 0;
  const json = argv.includes("--json");
  const verboseJson = argv.includes("--verbose-json");
  const callback = argv.find((a) => a.startsWith("--callback="))?.slice("--callback=".length);
  const agent = argv.find((a) => a.startsWith("--agent="))?.slice("--agent=".length);
  const modelArg = argv.find((a) => a.startsWith("--model="))?.slice("--model=".length);
  const model = modelArg
    ? (() => {
        const [providerID, modelID] = modelArg.split("/");
        return providerID && modelID ? { providerID, modelID } : undefined;
      })()
    : undefined;
  const permissionArg = argv.find((a) => a.startsWith("--permission="))?.slice("--permission=".length);
  const permission = (
    permissionArg === "once" || permissionArg === "always" || permissionArg === "reject"
      ? permissionArg
      : "reject"
  ) as "once" | "always" | "reject";
  const eventsArg = argv.find((a) => a.startsWith("--events="))?.slice("--events=".length);
  const events = eventsArg ? eventsArg.split(",") : undefined;
  const sessionName = argv.find((a) => a.startsWith("--session-name="))?.slice("--session-name=".length);
  const rest = argv.filter(
    (a) =>
      !a.startsWith("--directory=") &&
      !a.startsWith("--port=") &&
      a !== "--json" &&
      a !== "--verbose-json" &&
      !a.startsWith("--callback=") &&
      !a.startsWith("--events=") &&
      !a.startsWith("--session-name=") &&
      !a.startsWith("--agent=") &&
      !a.startsWith("--model=") &&
      !a.startsWith("--permission="),
  );
  const message = rest.join(" ").trim();
  return { message, directory: path.resolve(directory), port, json, verboseJson, callback, events, sessionName, agent, model, permission };
}

type EventLike = { type: string; properties?: Record<string, unknown> };

function shouldProcessEvent(ev: EventLike, sessionID: string): boolean {
  if (ev.type === "server.connected" || ev.type === "server.heartbeat") return true;
  if (ev.type === "message.part.updated") return true;
  if (
    ev.type === "session.status" ||
    ev.type === "session.idle" ||
    ev.type === "session.error" ||
    ev.type === "permission.asked"
  ) {
    return ev.properties?.sessionID === sessionID;
  }
  return false;
}

function main(): void {
  const args = parseArgs();
  if (!args.message) {
    process.stderr.write(
      'Usage: bun run src/index.ts "message" [--directory path] [--port N] [--json] [--verbose-json] [--callback TARGET] [--events type1,type2,...] [--agent name] [--model provider/id] [--permission reject|once|always]\n',
    );
    process.exit(1);
  }

  const run = async (): Promise<void> => {
    const configPath = path.join(args.directory, ".opencode", "opencode.json");
    let inlineConfig = {};
    try {
      const configContent = await fs.readFile(configPath, "utf-8");
      inlineConfig = JSON.parse(configContent);
    } catch {
      // No local config, use defaults
    }

    const opencode = await createOpencode({ port: args.port, config: inlineConfig });
    process.stderr.write(`Server: ${opencode.server.url}${EOL}`);

    const client = createOpencodeClient({
      baseUrl: opencode.server.url,
      directory: args.directory,
    });

    const timestamp = Date.now();
    const randomId = Math.random().toString(36).substring(2, 8);
    const sessionTitle = `lite-agent-${timestamp}-${randomId}`;
    const sessionRes = await client.session.create({ body: { title: sessionTitle } });
    process.stderr.write(`Session created: ${sessionTitle}${EOL}`);
    const sessionData = sessionRes.data;
    if (sessionRes.error || !sessionData?.id) {
      process.stderr.write(
        `session.create failed: ${JSON.stringify(sessionRes.error ?? sessionRes)}${EOL}`,
      );
      opencode.server.close();
      process.exit(1);
    }
    const sessionID = sessionData.id;

    const agentsResult = await client.app.agents();
    if (!agentsResult.data || agentsResult.data.length === 0 || agentsResult.data.every(a => !a)) {
      process.stderr.write("[warning] No agents available. Check your model configuration.\n");
    }

    function shouldEmitEvent(eventType: string): boolean {
      const defaultEvents = [
        "step_start",
        "step_finish",
        "tool_use",
        "text",
        "reasoning",
        "session.idle",
      ];
      const allowedEvents = args.events ?? defaultEvents;
      return allowedEvents.includes(eventType);
    }

    async function emitEvent(
      eventType: string,
      data: Record<string, unknown>,
      rawEvent?: EventLike
    ): Promise<void> {
      const timestamp = Date.now();
      const shouldEmit = shouldEmitEvent(eventType);

      if (shouldEmit && args.verboseJson) {
        const verbosePayload = {
          event: eventType,
          timestamp,
          sessionID,
          args: {
            directory: args.directory,
            agent: args.agent,
            model: args.model,
            permission: args.permission,
          },
          data,
          raw: rawEvent ?? null,
        };
        process.stderr.write(JSON.stringify(verbosePayload) + EOL);
      } else if (shouldEmit && args.json) {
        writeStructuredJson(eventType, data);
      }

      if (shouldEmit && args.callback) {
        await sendCallback(args.callback, args.sessionName, eventType, {
          ...data,
          timestamp,
        });
      }
    }

    function writeStructuredJson(
      type: string,
      data: Record<string, unknown>
    ): void {
      const payload = {
        type,
        timestamp: Date.now(),
        sessionId: sessionID,
        data,
      };
      process.stderr.write(JSON.stringify(payload) + EOL);
    }

    const eventsResult = await client.event.subscribe({});
    const stream = eventsResult.stream;
    const abort = new AbortController();
    const signal = abort.signal;
    let hasStreamText = false;

    const done = new Promise<void>((resolve) => {
      (async () => {
        try {
          for await (const event of stream) {
            if (signal.aborted) break;
            const ev = event as EventLike;
            if (!shouldProcessEvent(ev, sessionID)) continue;

            if (ev.type === "server.connected") {
              await emitEvent("server.connected", {}, ev);
              continue;
            }

            if (ev.type === "session.status") {
              const status = ev.properties?.status as { type?: string } | undefined;
              await emitEvent("session.status", { status }, ev);
              if (status?.type === "busy") process.stderr.write("[busy]\n");
              if (status?.type === "idle") process.stderr.write("[idle]\n");
              continue;
            }

            if (ev.type === "message.part.updated") {
              const props = ev.properties as {
                part?: {
                  sessionID?: string;
                  type?: string;
                  tool?: string;
                  state?: { status?: string; title?: string; output?: string };
                  text?: string;
                };
                delta?: string;
              };
              const part = props?.part;
              if (!part || part.sessionID !== sessionID) continue;

              const delta = props?.delta;
              if (delta !== undefined && delta !== "") {
                hasStreamText = true;
                await emitEvent("text_delta", { delta }, ev);
                process.stdout.write(delta);
                flushStdout();
                continue;
              }

              if (part.type === "tool" && part.state?.status === "completed") {
                const toolData = {
                  tool: part.tool,
                  title: part.state?.title,
                  output: part.state?.output,
                  status: part.state?.status,
                };
                await emitEvent("tool_use", toolData, ev);
                process.stderr.write(`[tool] ${part.tool ?? "?"} - ${part.state?.title ?? ""}\n`);
                if (part.tool === "bash" && part.state?.output?.trim()) {
                  process.stderr.write(part.state.output + EOL);
                }
                continue;
              }

              if (part.type === "step-start") {
                const stepData = {
                  stepType: "start",
                  partType: part.type,
                };
                await emitEvent("step_start", stepData, ev);
                process.stderr.write("[llm] step-start\n");
                continue;
              }
              if (part.type === "step-finish") {
                const stepData = {
                  stepType: "finish",
                  partType: part.type,
                };
                await emitEvent("step_finish", stepData, ev);
                process.stderr.write("[llm] step-finish\n");
                continue;
              }
              if (part.type === "reasoning") {
                const reasoningText = (part as { text?: string }).text?.trim();
                const reasoningData = {
                  text: reasoningText,
                  partType: part.type,
                };
                await emitEvent("reasoning", reasoningData, ev);
                if (reasoningText) {
                  hasStreamText = true;
                  process.stdout.write(reasoningText + EOL);
                  flushStdout();
                }
                continue;
              }
              if (part.type === "text") {
                const text = (part.text ?? "").trim();
                if (text) {
                  hasStreamText = true;
                  const textData = {
                    text,
                    partType: part.type,
                  };
                  await emitEvent("text", textData, ev);
                  process.stdout.write(text + EOL);
                  flushStdout();
                }
                continue;
              }
              continue;
            }

            if (ev.type === "session.error") {
              const props = ev.properties as {
                sessionID?: string;
                error?: { name?: string; data?: { message?: string } };
              };
              if (props.sessionID !== sessionID || !props.error) continue;
              const err =
                props.error?.data && "message" in props.error.data
                  ? String(props.error.data.message)
                  : String(props.error?.name ?? "Unknown");
              const errorData = {
                errorName: props.error?.name,
                errorMessage: props.error?.data?.message,
              };
              await emitEvent("error", errorData, ev);
              process.stderr.write(`Error: ${err}\n`);
              abort.abort();
              resolve();
              return;
            }

            if (ev.type === "session.idle" && ev.properties?.sessionID === sessionID) {
              await emitEvent("session.idle", { hasStreamText }, ev);
              if (!hasStreamText) {
                process.stderr.write("[warning] Session ended without response. Check model configuration.\n");
              }
              process.stderr.write("[idle]\n");
              abort.abort();
              resolve();
              return;
            }

            if (ev.type === "permission.asked") {
              const perm = ev.properties as {
                sessionID?: string;
                id?: string;
                permission?: string;
                patterns?: string[];
              };
              if (perm.sessionID !== sessionID || !perm.id) continue;
              const permData = {
                permissionId: perm.id,
                permission: perm.permission,
                patterns: perm.patterns,
              };
              await emitEvent("permission.asked", permData, ev);
              await client.postSessionIdPermissionsPermissionId({
                path: { id: sessionID, permissionID: perm.id },
                body: { response: args.permission },
              });
              continue;
            }
          }
        } finally {
          resolve();
        }
      })();
      signal.addEventListener("abort", () => resolve());
    });

    const configModel = (inlineConfig as { model?: string }).model;
    const modelToUse = args.model ?? (configModel ? (() => {
      const [providerID, modelID] = configModel.split("/");
      return providerID && modelID ? { providerID, modelID } : undefined;
    })() : undefined);
    
    const promptPromise = client.session.prompt({
      path: { id: sessionID },
      body: {
        parts: [{ type: "text", text: args.message }],
        ...(args.agent ? { agent: args.agent } : {}),
        ...(modelToUse ? { model: modelToUse } : {}),
      },
    });

    await done;
    abort.abort();

    const promptRes = await promptPromise;
    const data = promptRes.data as
      | { info?: unknown; parts?: Array<{ type?: string; text?: string }> }
      | undefined;

    if (promptRes.error) {
      process.stderr.write(`prompt error: ${JSON.stringify(promptRes.error)}${EOL}`);
    }

    if (!promptRes.error && (!data?.parts || data.parts.length === 0)) {
      process.stderr.write("[warning] No response from LLM. Model may be unavailable or misconfigured.\n");
    }

    const parts = data?.parts;
    const emittedFromPrompt =
      !args.json &&
      !hasStreamText &&
      Array.isArray(parts) &&
      parts.length > 0;
    if (emittedFromPrompt && parts) {
      const textParts = parts.filter(
        (p: { type?: string; text?: string }) => p.type === "text" && p.text,
      );
      const text = textParts.map((p: { text?: string }) => p.text ?? "").join(EOL);
      if (text.trim()) {
        process.stdout.write(text.trim() + EOL);
        flushStdout();
      }
    }

    if (!args.json && !hasStreamText && !emittedFromPrompt) {
      const messagesRes = await client.session.messages({ path: { id: sessionID } });
      const messages = messagesRes.data as
        | Array<{
            info?: { role?: string };
            parts?: Array<{ type?: string; text?: string }>;
          }>
        | undefined;
      if (!messagesRes.error && Array.isArray(messages) && messages.length > 0) {
        const lastAssistant = [...messages].reverse().find((m) => m.info?.role === "assistant");
        const msg = lastAssistant ?? messages[messages.length - 1];
        const parts = msg?.parts ?? [];
        const textParts = parts.filter(
          (p: { type?: string; text?: string }) => p.type === "text" && p.text,
        );
        const text = textParts.map((p: { text?: string }) => p.text).join(EOL).trim();
        if (text) {
          process.stdout.write(text + EOL);
          flushStdout();
        }
      }
    }

    opencode.server.close();
  };

  run().then(
    () => {
      flushStdout();
      setTimeout(() => process.exit(0), 100);
    },
    (err) => {
      process.stderr.write(String(err?.message ?? err) + EOL);
      process.exit(1);
    },
  );
}

main();
