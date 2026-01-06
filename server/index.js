"use strict";

const path = require("node:path");
const crypto = require("node:crypto");
const { spawn } = require("node:child_process");
const readline = require("node:readline");
const express = require("express");

function createServer(options = {}) {
  const config = {
    host: options.host ?? process.env.HOST ?? "127.0.0.1",
    port: Number(options.port ?? process.env.PORT ?? 3333),
    claudeBin: options.claudeBin ?? process.env.CLAUDE_BIN ?? "claude",
    defaultModel: options.defaultModel ?? process.env.CLAUDE_DEFAULT_MODEL ?? "",
    historyLimit: options.historyLimit ?? 200,
    spawnImpl: options.spawnImpl ?? spawn,
  };

  const app = express();
  app.disable("x-powered-by");
  app.use(express.json({ limit: "1mb" }));

  app.use((req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "no-referrer");
    next();
  });

  function allowOrigin(req) {
    const origin = req.get("origin");
    if (!origin) return true;
    const hostHeader = req.get("host");
    const allowed = new Set([
      `http://${hostHeader}`,
      `http://localhost:${config.port}`,
      `http://127.0.0.1:${config.port}`,
    ]);
    return allowed.has(origin);
  }

  app.use((req, res, next) => {
    if (!allowOrigin(req)) {
      return res.status(403).json({ error: "Forbidden origin" });
    }
    return next();
  });

  app.use(express.static(path.join(__dirname, "..", "public")));

  const sessions = new Map();

  function makeId(bytes = 12) {
    return crypto.randomBytes(bytes).toString("hex");
  }

  function nowIso() {
    return new Date().toISOString();
  }

  function sendSse(res, event, data) {
    const payload = JSON.stringify(data).replace(/\n/g, "\\n");
    res.write(`event: ${event}\n`);
    res.write(`data: ${payload}\n\n`);
  }

  function extractAssistantText(msg) {
    const candidates = [msg.message, msg.delta, msg];
    for (const candidate of candidates) {
      if (!candidate || !candidate.content) continue;
      if (Array.isArray(candidate.content)) {
        const chunks = candidate.content
          .filter((item) => item && item.type === "text")
          .map((item) => item.text);
        if (chunks.length > 0) return chunks.join("");
      }
    }
    if (typeof msg.text === "string") return msg.text;
    return "";
  }

  class ClaudeSession {
    constructor({ id, token, model }) {
      this.id = id;
      this.token = token;
      this.model = model;
      this.createdAt = nowIso();
      this.status = "starting";
      this.history = [];
      this.subscribers = new Set();
      this.pendingPermissions = new Map();
      this.seq = 0;
      this.heartbeat = null;
      this.process = null;
      this.readline = null;
      this.start();
    }

    info() {
      return {
        id: this.id,
        model: this.model || null,
        createdAt: this.createdAt,
        status: this.status,
      };
    }

    start() {
      const args = [
        "--input-format",
        "stream-json",
        "--output-format",
        "stream-json",
        "--verbose",
        "--permission-prompt-tool",
        "stdio",
      ];

      if (this.model) {
        args.push("--model", this.model);
      }

      this.process = config.spawnImpl(config.claudeBin, args, { stdio: ["pipe", "pipe", "pipe"] });

      this.process.on("error", (err) => {
        this.status = "error";
        this.pushEvent("session_status", { status: this.status, error: err.message });
      });

      this.process.on("exit", (code, signal) => {
        this.status = "exited";
        this.pushEvent("session_status", { status: this.status, code, signal });
        this.closeSubscribers();
      });

      this.process.stderr.on("data", (buf) => {
        const message = buf.toString();
        this.pushEvent("claude_stderr", { message }, false);
      });

      this.readline = readline.createInterface({ input: this.process.stdout });
      this.readline.on("line", (line) => {
        if (!line.trim()) return;
        let msg;
        try {
          msg = JSON.parse(line);
        } catch {
          this.pushEvent("error", { message: "Bad JSON from Claude", line }, false);
          return;
        }

        if (msg.type === "control_request") {
          this.handleControlRequest(msg);
          return;
        }

        const assistantText = extractAssistantText(msg);
        if (assistantText) {
          this.pushEvent("assistant_text", { text: assistantText });
        }

        this.pushEvent("claude_message", msg, false);
      });

      this.status = "running";
      this.pushEvent("session_status", { status: this.status });
    }

    pushEvent(type, data, keep = true) {
      const event = {
        id: `${this.id}:${this.seq++}`,
        type,
        data,
        timestamp: nowIso(),
      };

      if (keep) {
        this.history.push(event);
        if (this.history.length > config.historyLimit) this.history.shift();
      }

      for (const res of this.subscribers) {
        sendSse(res, type, event);
      }
    }

    addSubscriber(res) {
      this.subscribers.add(res);

      for (const event of this.history) {
        sendSse(res, event.type, event);
      }

      if (!this.heartbeat) {
        this.heartbeat = setInterval(() => {
          for (const client of this.subscribers) {
            client.write(": ping\n\n");
          }
        }, 20000);
      }
    }

    removeSubscriber(res) {
      this.subscribers.delete(res);
      if (this.subscribers.size === 0 && this.heartbeat) {
        clearInterval(this.heartbeat);
        this.heartbeat = null;
      }
    }

    closeSubscribers() {
      for (const res of this.subscribers) {
        res.end();
      }
      this.subscribers.clear();
      if (this.heartbeat) {
        clearInterval(this.heartbeat);
        this.heartbeat = null;
      }
    }

    send(obj) {
      if (!this.process || !this.process.stdin) {
        throw new Error("Claude process is not available");
      }
      this.process.stdin.write(JSON.stringify(obj) + "\n");
    }

    sendUser(text, clientMessageId) {
      this.send({
        type: "user",
        session_id: "",
        message: {
          role: "user",
          content: [{ type: "text", text }],
        },
        parent_tool_use_id: null,
      });

      this.pushEvent("user_message", { text, clientMessageId });
    }

    interrupt() {
      this.send({
        type: "control_request",
        request_id: makeId(),
        request: { subtype: "interrupt" },
      });
    }

    handleControlRequest(msg) {
      const request = msg.request || {};

      if (request.subtype === "can_use_tool") {
        const entry = {
          requestId: msg.request_id,
          toolName: request.tool_name,
          input: request.input || {},
          suggestions: request.permission_suggestions || [],
          toolUseId: request.tool_use_id || null,
        };
        this.pendingPermissions.set(msg.request_id, entry);
        this.pushEvent("permission_request", entry);
        return;
      }

      this.send({
        type: "control_response",
        response: {
          subtype: "error",
          request_id: msg.request_id,
          error: `Unsupported control request subtype: ${request.subtype}`,
        },
      });
    }

    respondToPermission(requestId, decision, message) {
      const entry = this.pendingPermissions.get(requestId);
      if (!entry) throw new Error("Permission request not found");

      this.pendingPermissions.delete(requestId);
      const behavior = decision === "allow" ? "allow" : "deny";

      this.send({
        type: "control_response",
        response: {
          subtype: "success",
          request_id: requestId,
          response: {
            behavior,
            message: message || "",
            toolUseID: entry.toolUseId,
          },
        },
      });
    }

    close() {
      if (this.readline) {
        this.readline.close();
        this.readline = null;
      }
      if (this.process && !this.process.killed) {
        this.process.kill("SIGTERM");
        setTimeout(() => {
          if (this.process && !this.process.killed) {
            this.process.kill("SIGKILL");
          }
        }, 4000);
      }
      this.status = "closed";
      this.pushEvent("session_status", { status: this.status });
      this.closeSubscribers();
    }
  }

  function getToken(req) {
    const auth = req.get("authorization") || "";
    if (auth.startsWith("Bearer ")) return auth.slice("Bearer ".length).trim();
    if (req.query && req.query.token) return String(req.query.token);
    if (req.body && req.body.token) return String(req.body.token);
    return "";
  }

  function requireSession(req, res, next) {
    const session = sessions.get(req.params.id);
    if (!session) return res.status(404).json({ error: "Session not found" });
    const token = getToken(req);
    if (!token || token !== session.token) {
      return res.status(401).json({ error: "Invalid session token" });
    }
    req.session = session;
    return next();
  }

  app.get("/api/sessions", (req, res) => {
    const list = Array.from(sessions.values()).map((session) => session.info());
    res.json({ sessions: list });
  });

  app.post("/api/sessions", (req, res) => {
    const model = typeof req.body?.model === "string" ? req.body.model.trim() : "";
    const session = new ClaudeSession({
      id: makeId(),
      token: makeId(24),
      model: model || config.defaultModel,
    });

    sessions.set(session.id, session);
    res.json({
      id: session.id,
      token: session.token,
      model: session.model || null,
      createdAt: session.createdAt,
    });
  });

  app.get("/api/sessions/:id/stream", requireSession, (req, res) => {
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });
    res.write("\n");

    req.session.addSubscriber(res);

    req.on("close", () => {
      req.session.removeSubscriber(res);
    });
  });

  app.post("/api/sessions/:id/send", requireSession, (req, res) => {
    const text = typeof req.body?.text === "string" ? req.body.text.trim() : "";
    if (!text) return res.status(400).json({ error: "Text is required" });

    req.session.sendUser(text, req.body?.clientMessageId || null);
    return res.json({ ok: true });
  });

  app.post("/api/sessions/:id/interrupt", requireSession, (req, res) => {
    req.session.interrupt();
    res.json({ ok: true });
  });

  app.post("/api/sessions/:id/permissions", requireSession, (req, res) => {
    const requestId = typeof req.body?.requestId === "string" ? req.body.requestId : "";
    const decision = typeof req.body?.decision === "string" ? req.body.decision : "";
    const message = typeof req.body?.message === "string" ? req.body.message : "";

    if (!requestId) return res.status(400).json({ error: "requestId is required" });
    if (!decision || !["allow", "deny"].includes(decision)) {
      return res.status(400).json({ error: "decision must be allow or deny" });
    }

    try {
      req.session.respondToPermission(requestId, decision, message);
      return res.json({ ok: true });
    } catch (err) {
      return res.status(404).json({ error: err.message || "Permission not found" });
    }
  });

  app.delete("/api/sessions/:id", requireSession, (req, res) => {
    req.session.close();
    sessions.delete(req.session.id);
    res.json({ ok: true });
  });

  function closeAllSessions() {
    for (const session of sessions.values()) {
      session.close();
    }
    sessions.clear();
  }

  function listen() {
    return app.listen(config.port, config.host, () => {
      console.log(`remote-claude running on http://${config.host}:${config.port}`);
      console.log(`Claude binary: ${config.claudeBin}`);
    });
  }

  return { app, listen, closeAllSessions, sessions, config };
}

if (require.main === module) {
  const { listen, closeAllSessions } = createServer();
  const server = listen();

  const shutdown = () => {
    closeAllSessions();
    server.close(() => process.exit(0));
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

module.exports = { createServer };
