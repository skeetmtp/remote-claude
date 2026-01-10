import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { once } from "node:events";
import { createServer, type ServerResponse } from "node:http";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, test } from "vitest";

type OutputCollector = {
  get: () => string;
};

type ProxyProcess = {
  child: ChildProcessWithoutNullStreams;
  stdout: OutputCollector;
  stderr: OutputCollector;
};

type SseServer = {
  url: string;
  connectionCount: () => number;
  sendEvent: (event: string, data: string) => void;
  sendRetry: () => void;
  closeAll: () => void;
  stop: () => Promise<void>;
};

const __dirname = dirname(fileURLToPath(import.meta.url));
const proxyRoot = resolve(__dirname, "..");
const uuidV4 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const stubScript = `#!/usr/bin/env node
const mode = process.env.CLAUDE_STUB_MODE || "echo";
const exitCode = Number.parseInt(process.env.CLAUDE_STUB_EXIT_CODE || "0", 10);
const exitDelayMs = Number.parseInt(
  process.env.CLAUDE_STUB_EXIT_DELAY_MS || "0",
  10,
);
const signal = process.env.CLAUDE_STUB_SIGNAL || "SIGTERM";
const printArgv = process.env.CLAUDE_STUB_PRINT_ARGV === "1";

if (printArgv) {
  process.stdout.write(JSON.stringify(process.argv.slice(2)));
  process.stdout.write("\\n");
}

const keepAlive = () => {
  setInterval(() => {}, 1000);
};

if (mode === "echo") {
  process.stdin.on("data", (chunk) => {
    process.stdout.write(chunk);
  });
  process.stdin.on("end", () => {
    process.stdout.write("EOF\\n");
    process.exit(0);
  });
  process.stdin.resume();
} else if (mode === "exit") {
  setTimeout(() => process.exit(exitCode), exitDelayMs);
  keepAlive();
} else if (mode === "wait") {
  process.stdin.resume();
  keepAlive();
} else if (mode === "signal") {
  setTimeout(() => process.kill(process.pid, signal), exitDelayMs);
  keepAlive();
} else {
  keepAlive();
}
`;

async function createClaudeStub(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "claude-stub-"));
  const stubPath = join(dir, "claude");
  await writeFile(stubPath, stubScript, { mode: 0o755 });
  return stubPath;
}

function collectOutput(stream: NodeJS.ReadableStream): OutputCollector {
  let buffer = "";
  stream.setEncoding("utf8");
  stream.on("data", (chunk: string) => {
    buffer += chunk;
  });
  return {
    get: () => buffer,
  };
}

function spawnProxy(options: {
  args?: string[];
  env?: NodeJS.ProcessEnv;
}): ProxyProcess {
  const child = spawn(
    process.execPath,
    ["-r", "ts-node/register", "src/index.ts", ...(options.args ?? [])],
    {
      cwd: proxyRoot,
      env: {
        ...process.env,
        ...options.env,
      },
      stdio: ["pipe", "pipe", "pipe"],
    },
  );
  return {
    child,
    stdout: collectOutput(child.stdout),
    stderr: collectOutput(child.stderr),
  };
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitFor(
  predicate: () => boolean,
  options?: { timeoutMs?: number; intervalMs?: number; message?: string },
): Promise<void> {
  const timeoutMs = options?.timeoutMs ?? 2000;
  const intervalMs = options?.intervalMs ?? 25;
  const message = options?.message ?? "condition";
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (predicate()) {
      return;
    }
    await delay(intervalMs);
  }
  throw new Error(`Timeout waiting for ${message}`);
}

async function stopProxy(proxy: ProxyProcess): Promise<void> {
  if (proxy.child.exitCode !== null) {
    return;
  }
  proxy.child.kill("SIGTERM");
  await Promise.race([once(proxy.child, "exit"), delay(500)]);
  if (proxy.child.exitCode === null) {
    proxy.child.kill("SIGKILL");
    await Promise.race([once(proxy.child, "exit"), delay(500)]);
  }
}

async function waitForExit(child: ChildProcessWithoutNullStreams): Promise<{
  code: number | null;
  signal: NodeJS.Signals | null;
}> {
  if (child.exitCode !== null || child.signalCode !== null) {
    return { code: child.exitCode, signal: child.signalCode };
  }
  const [code, signal] = (await once(child, "exit")) as [
    number | null,
    NodeJS.Signals | null,
  ];
  return { code, signal };
}

async function startSseServer(port?: number): Promise<SseServer> {
  const clients = new Set<ServerResponse>();
  let connectionCount = 0;

  const server = createServer((req, res) => {
    if (req.url?.startsWith("/events")) {
      connectionCount += 1;
      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      });
      res.write("\n");
      clients.add(res);
      req.on("close", () => {
        clients.delete(res);
      });
      return;
    }
    res.statusCode = 404;
    res.end();
  });

  await new Promise<void>((resolve) => {
    server.listen(port ?? 0, "127.0.0.1", () => resolve());
  });

  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Failed to bind SSE server");
  }
  const url = `http://127.0.0.1:${address.port}`;

  const sendEvent = (event: string, data: string) => {
    const frame = `event: ${event}\ndata: ${data}\n\n`;
    for (const client of clients) {
      client.write(frame);
    }
  };

  const closeAll = () => {
    for (const client of clients) {
      client.end();
    }
  };

  const stop = async () => {
    closeAll();
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
  };

  return {
    url,
    connectionCount: () => connectionCount,
    sendEvent,
    sendRetry: () => sendEvent("retry", "retry"),
    closeAll,
    stop,
  };
}

async function reservePort(): Promise<number> {
  return new Promise((resolve) => {
    const server = createServer();
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        throw new Error("Failed to reserve port");
      }
      const port = address.port;
      server.close(() => resolve(port));
    });
  });
}

function countOccurrences(haystack: string, needle: string): number {
  if (needle.length === 0) {
    return 0;
  }
  let count = 0;
  let index = 0;
  while (true) {
    const nextIndex = haystack.indexOf(needle, index);
    if (nextIndex === -1) {
      return count;
    }
    count += 1;
    index = nextIndex + needle.length;
  }
}

describe("proxy integration", () => {
  let stubPath = "";

  beforeAll(async () => {
    stubPath = await createClaudeStub();
  });

  afterAll(async () => {
    if (stubPath) {
      await rm(dirname(stubPath), { recursive: true, force: true });
    }
  });

  test("retry event sends ESC + retry + newline", async () => {
    const sse = await startSseServer();
    const proxy = spawnProxy({
      env: {
        CLAUDE_BIN: stubPath,
        CLAUDE_STUB_MODE: "echo",
        PROXY_SERVER_URL: sse.url,
      },
    });
    try {
      await waitFor(() => sse.connectionCount() >= 1, {
        message: "SSE connection",
      });
      sse.sendRetry();
      await waitFor(() => proxy.stdout.get().includes("\x1bretry\n"), {
        message: "retry sequence",
      });
    } finally {
      await stopProxy(proxy);
      await sse.stop();
    }
  });

  test("adds session id and preserves argv", async () => {
    const sse = await startSseServer();
    const proxy = spawnProxy({
      args: ["--model", "sonnet", "--foo", "bar"],
      env: {
        CLAUDE_BIN: stubPath,
        CLAUDE_STUB_MODE: "wait",
        CLAUDE_STUB_PRINT_ARGV: "1",
        PROXY_SERVER_URL: sse.url,
      },
    });
    try {
      await waitFor(() => proxy.stdout.get().includes("\n"), {
        message: "argv output",
      });
      const line = proxy.stdout.get().trim().split(/\r?\n/)[0] ?? "[]";
      const argv = JSON.parse(line) as string[];
      expect(argv).toEqual(
        expect.arrayContaining(["--model", "sonnet", "--foo", "bar"]),
      );
      const sessionIndex = argv.indexOf("--session-id");
      expect(sessionIndex).toBeGreaterThan(-1);
      const sessionId = argv[sessionIndex + 1];
      expect(sessionId).toMatch(uuidV4);
    } finally {
      await stopProxy(proxy);
      await sse.stop();
    }
  });

  test("reconnects when server starts later", async () => {
    const port = await reservePort();
    const proxy = spawnProxy({
      env: {
        CLAUDE_BIN: stubPath,
        CLAUDE_STUB_MODE: "echo",
        PROXY_SERVER_URL: `http://127.0.0.1:${port}`,
        BACKOFF_INITIAL_MS: "50",
        BACKOFF_MAX_MS: "200",
      },
    });
    let sse: SseServer | null = null;
    try {
      await delay(150);
      expect(proxy.child.exitCode).toBeNull();
      sse = await startSseServer(port);
      await waitFor(() => (sse?.connectionCount() ?? 0) >= 1, {
        message: "SSE reconnection",
        timeoutMs: 3000,
      });
      sse.sendRetry();
      await waitFor(() => proxy.stdout.get().includes("\x1bretry\n"), {
        message: "retry after reconnect",
      });
    } finally {
      await stopProxy(proxy);
      if (sse) {
        await sse.stop();
      }
    }
  });

  test("reconnects after SSE disconnect", async () => {
    const sse = await startSseServer();
    const proxy = spawnProxy({
      env: {
        CLAUDE_BIN: stubPath,
        CLAUDE_STUB_MODE: "echo",
        PROXY_SERVER_URL: sse.url,
        BACKOFF_INITIAL_MS: "50",
        BACKOFF_MAX_MS: "200",
      },
    });
    try {
      await waitFor(() => sse.connectionCount() >= 1, {
        message: "initial SSE connection",
      });
      sse.closeAll();
      await waitFor(() => sse.connectionCount() >= 2, {
        message: "SSE reconnection",
        timeoutMs: 3000,
      });
      sse.sendRetry();
      await waitFor(() => proxy.stdout.get().includes("\x1bretry\n"), {
        message: "retry after reconnect",
      });
    } finally {
      await stopProxy(proxy);
      await sse.stop();
    }
  });

  test("exits with claude exit code", async () => {
    const proxy = spawnProxy({
      env: {
        CLAUDE_BIN: stubPath,
        CLAUDE_STUB_MODE: "exit",
        CLAUDE_STUB_EXIT_CODE: "7",
        CLAUDE_STUB_EXIT_DELAY_MS: "50",
      },
    });
    const result = await waitForExit(proxy.child);
    expect(result.code).toBe(7);
  });

  test("exits non-zero on claude signal", async () => {
    const proxy = spawnProxy({
      env: {
        CLAUDE_BIN: stubPath,
        CLAUDE_STUB_MODE: "signal",
        CLAUDE_STUB_SIGNAL: "SIGTERM",
        CLAUDE_STUB_EXIT_DELAY_MS: "50",
      },
    });
    const result = await waitForExit(proxy.child);
    expect(result.code).toBe(1);
  });

  test("stdin close reaches claude and exits cleanly", async () => {
    const sse = await startSseServer();
    const proxy = spawnProxy({
      env: {
        CLAUDE_BIN: stubPath,
        CLAUDE_STUB_MODE: "echo",
        PROXY_SERVER_URL: sse.url,
      },
    });
    try {
      proxy.child.stdin.end();
      const result = await waitForExit(proxy.child);
      expect(result.code).toBe(0);
      expect(proxy.stdout.get()).toContain("EOF");
    } finally {
      await stopProxy(proxy);
      await sse.stop();
    }
  });

  test("ignores retry after claude exits", async () => {
    const sse = await startSseServer();
    const proxy = spawnProxy({
      env: {
        CLAUDE_BIN: stubPath,
        CLAUDE_STUB_MODE: "exit",
        CLAUDE_STUB_EXIT_CODE: "0",
        CLAUDE_STUB_EXIT_DELAY_MS: "50",
        PROXY_SERVER_URL: sse.url,
      },
    });
    try {
      const result = await waitForExit(proxy.child);
      expect(result.code).toBe(0);
      sse.sendRetry();
      await delay(100);
    } finally {
      await stopProxy(proxy);
      await sse.stop();
    }
  });

  test("handles multiple retry events in order", async () => {
    const sse = await startSseServer();
    const proxy = spawnProxy({
      env: {
        CLAUDE_BIN: stubPath,
        CLAUDE_STUB_MODE: "echo",
        PROXY_SERVER_URL: sse.url,
      },
    });
    try {
      await waitFor(() => sse.connectionCount() >= 1, {
        message: "SSE connection",
      });
      sse.sendRetry();
      sse.sendRetry();
      sse.sendRetry();
      await waitFor(
        () => countOccurrences(proxy.stdout.get(), "\x1bretry\n") >= 3,
        { message: "three retry sequences" },
      );
    } finally {
      await stopProxy(proxy);
      await sse.stop();
    }
  });

});
