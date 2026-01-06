"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const { EventEmitter } = require("node:events");
const { PassThrough } = require("node:stream");
const readline = require("node:readline");
const Module = require("node:module");

const originalLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (request === "express") return require("./express-stub");
  return originalLoad(request, parent, isMain);
};

const { createServer } = require("../server/index.js");

function createFakeSpawn() {
  const processes = [];

  function spawnImpl() {
    const proc = new EventEmitter();
    proc.stdin = new PassThrough();
    proc.stdout = new PassThrough();
    proc.stderr = new PassThrough();
    proc.killed = false;
    proc.exitCode = null;

    proc.kill = () => {
      proc.killed = true;
      proc.exitCode = 0;
      proc.emit("exit", 0, null);
    };

    proc.off = proc.removeListener.bind(proc);

    const rl = readline.createInterface({ input: proc.stdin });
    rl.on("line", (line) => {
      let msg;
      try {
        msg = JSON.parse(line);
      } catch {
        return;
      }

      if (msg.type === "user") {
        const text = msg.message?.content?.[0]?.text || "";
        const response = {
          type: "assistant",
          message: { content: [{ type: "text", text: `Echo: ${text}` }] },
        };
        proc.stdout.write(JSON.stringify(response) + "\n");
      }
    });

    processes.push(proc);
    return proc;
  }

  spawnImpl.processes = processes;
  return spawnImpl;
}

function openSse(url) {
  return new Promise((resolve, reject) => {
    const req = http.get(url, (res) => resolve(res));
    req.on("error", reject);
  });
}

function waitForEvent(res, eventName, timeoutMs = 2000) {
  return new Promise((resolve, reject) => {
    const rl = readline.createInterface({ input: res });
    let currentEvent = null;
    let currentData = "";

    const timer = setTimeout(() => {
      cleanup();
      reject(new Error(`Timed out waiting for ${eventName}`));
    }, timeoutMs);

    function cleanup() {
      clearTimeout(timer);
      rl.close();
      res.destroy();
    }

    rl.on("line", (line) => {
      if (line.startsWith(":")) return;
      if (line.startsWith("event:")) {
        currentEvent = line.slice(6).trim();
        return;
      }
      if (line.startsWith("data:")) {
        currentData += line.slice(5).trim();
        return;
      }
      if (line.trim() === "") {
        if (currentEvent === eventName) {
          try {
            const parsed = JSON.parse(currentData || "{}");
            cleanup();
            resolve(parsed);
          } catch (err) {
            cleanup();
            reject(err);
          }
          return;
        }
        currentEvent = null;
        currentData = "";
      }
    });
  });
}

async function apiJson(baseUrl, path, options) {
  const res = await fetch(`${baseUrl}${path}`, options);
  const body = await res.json();
  if (!res.ok) {
    throw new Error(body.error || "Request failed");
  }
  return body;
}

let server;
let baseUrl;
let spawnImpl;
let serverInstance;

// Start server once for all tests
const testHarness = test.before(async () => {
  spawnImpl = createFakeSpawn();
  serverInstance = createServer({ host: "127.0.0.1", port: 0, spawnImpl });
  server = serverInstance.listen();
  await new Promise((resolve) => setTimeout(resolve, 10));
  const address = server.address();
  if (!address) throw new Error("Server did not start");
  baseUrl = `http://127.0.0.1:${address.port}`;
});

test.after(async () => {
  if (serverInstance) serverInstance.closeAllSessions();
  if (server) await new Promise((resolve) => server.close(resolve));
  Module._load = originalLoad;
});

test("session lifecycle and send", async () => {
  const list = await apiJson(baseUrl, "/api/sessions");
  assert.equal(list.sessions.length, 0);

  const created = await apiJson(baseUrl, "/api/sessions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: "test-model" }),
  });

  assert.ok(created.id);
  assert.ok(created.token);

  const sessions = await apiJson(baseUrl, "/api/sessions");
  assert.equal(sessions.sessions.length, 1);
  assert.equal(sessions.sessions[0].model, "test-model");

  const stream = await openSse(`${baseUrl}/api/sessions/${created.id}/stream?token=${created.token}`);

  await apiJson(baseUrl, `/api/sessions/${created.id}/send`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${created.token}`,
    },
    body: JSON.stringify({ text: "Hello" }),
  });

  const event = await waitForEvent(stream, "user_message");
  assert.equal(event.data.text, "Hello");

  await apiJson(baseUrl, `/api/sessions/${created.id}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${created.token}` },
  });
});

test("permission request is streamed", async () => {
  const created = await apiJson(baseUrl, "/api/sessions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });

  const stream = await openSse(`${baseUrl}/api/sessions/${created.id}/stream?token=${created.token}`);

  const proc = spawnImpl.processes.at(-1);
  const controlRequest = {
    type: "control_request",
    request_id: "perm-1",
    request: {
      subtype: "can_use_tool",
      tool_name: "Read",
      tool_use_id: "tool-1",
      input: { file_path: "README.md" },
      permission_suggestions: [],
    },
  };
  proc.stdout.write(JSON.stringify(controlRequest) + "\n");

  const event = await waitForEvent(stream, "permission_request");

  assert.equal(event.data.requestId, "perm-1");
  assert.equal(event.data.toolName, "Read");

  await apiJson(baseUrl, `/api/sessions/${created.id}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${created.token}` },
  });
});
