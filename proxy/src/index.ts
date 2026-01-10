#!/usr/bin/env node

import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { URL } from "node:url";

type SseEvent = {
  event: string;
  data: string;
};

const DEFAULT_SERVER_URL = "http://localhost:3000";
const DEFAULT_CLAUDE_PATH = `${process.env.HOME ?? ""}/.local/bin/claude`;
const CLAUDE_PATH = process.env.CLAUDE_BIN ?? DEFAULT_CLAUDE_PATH;
const BACKOFF_INITIAL_MS = parseEnvInt("BACKOFF_INITIAL_MS", 1000);
const BACKOFF_MAX_MS = parseEnvInt("BACKOFF_MAX_MS", 30000);

const sessionId = randomUUID();
const claudeArgs = [...process.argv.slice(2), "--session-id", sessionId];

const claude = spawn(CLAUDE_PATH, claudeArgs, {
  stdio: ["pipe", "pipe", "pipe"],
});

claude.on("error", (error) => {
  console.error("Failed to start claude:", error);
  process.exit(1);
});

if (claude.stdin) {
  process.stdin.pipe(claude.stdin);
}
if (claude.stdout) {
  claude.stdout.pipe(process.stdout);
}
if (claude.stderr) {
  claude.stderr.pipe(process.stderr);
}

const controller = new AbortController();

const forwardSignal = (signal: NodeJS.Signals) => {
  if (!claude.killed) {
    claude.kill(signal);
  }
  controller.abort();
};

process.on("SIGINT", () => forwardSignal("SIGINT"));
process.on("SIGTERM", () => forwardSignal("SIGTERM"));
process.on("exit", () => controller.abort());

claude.on("exit", (code, signal) => {
  controller.abort();
  if (code !== null) {
    process.exit(code);
  }
  if (signal) {
    console.error(`claude exited with signal ${signal}`);
    process.exit(1);
  }
});

const serverUrl = new URL(
  process.env.PROXY_SERVER_URL ?? DEFAULT_SERVER_URL,
);
serverUrl.pathname = `${serverUrl.pathname.replace(/\/$/, "")}/events`;
serverUrl.searchParams.set("sessionId", sessionId);

const sendRetry = () => {
  if (!claude.stdin || claude.killed) {
    return;
  }
  claude.stdin.write("\u001b");
  claude.stdin.write("retry");
  claude.stdin.write("\n");
};

const handleEvent = (event: SseEvent) => {
  if (event.event === "retry" || event.data.trim() === "retry") {
    sendRetry();
  }
};

void startEventStream(serverUrl.toString(), handleEvent, controller.signal);

async function startEventStream(
  url: string,
  onEvent: (event: SseEvent) => void,
  signal: AbortSignal,
): Promise<void> {
  let attempt = 0;
  while (!signal.aborted) {
    try {
      await connectSse(url, onEvent, signal);
      attempt = 0;
    } catch (error) {
      if (signal.aborted) {
        break;
      }
      console.error("SSE connection error:", error);
    }
    const delayMs = Math.min(BACKOFF_INITIAL_MS * 2 ** attempt, BACKOFF_MAX_MS);
    attempt = Math.min(attempt + 1, 30);
    try {
      await delay(delayMs, undefined, { signal });
    } catch {
      if (signal.aborted) {
        break;
      }
    }
  }
}

function parseEnvInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) {
    return fallback;
  }
  const value = Number.parseInt(raw, 10);
  if (!Number.isFinite(value) || value <= 0) {
    return fallback;
  }
  return value;
}

async function connectSse(
  url: string,
  onEvent: (event: SseEvent) => void,
  signal: AbortSignal,
): Promise<void> {
  const response = await fetch(url, {
    headers: { Accept: "text/event-stream" },
    signal,
  });

  if (!response.ok) {
    throw new Error(
      `SSE request failed: ${response.status} ${response.statusText}`,
    );
  }

  if (!response.body) {
    throw new Error("SSE response has no body");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let eventName = "message";
  let dataLines: string[] = [];

  const dispatch = () => {
    if (eventName === "message" && dataLines.length === 0) {
      return;
    }
    const data = dataLines.join("\n");
    onEvent({ event: eventName, data });
    eventName = "message";
    dataLines = [];
  };

  while (!signal.aborted) {
    const { value, done } = await reader.read();
    if (done) {
      break;
    }
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      if (line === "") {
        dispatch();
        continue;
      }
      if (line.startsWith(":")) {
        continue;
      }
      if (line.startsWith("event:")) {
        const nextEvent = line.slice(6).trim();
        eventName = nextEvent.length > 0 ? nextEvent : "message";
        continue;
      }
      if (line.startsWith("data:")) {
        dataLines.push(line.slice(5).replace(/^ /, ""));
      }
    }
  }

  if (dataLines.length > 0 || eventName !== "message") {
    dispatch();
  }

  throw new Error("SSE connection closed");
}
