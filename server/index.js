"use strict";

// Load .env file if present
require("dotenv").config();

const path = require("node:path");
const crypto = require("node:crypto");
const fs = require("node:fs");
const { spawn } = require("node:child_process");
const readline = require("node:readline");
const express = require("express");
const qrcode = require("qrcode-terminal");

// Logger utility
let logStream = null;

let unsupportedControlStream = null;

function initLogger() {
  const logsDir = path.join(__dirname, "..", "logs");
  if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true });
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const logFile = path.join(logsDir, `server-${timestamp}.log`);
  const unsupportedControlFile = path.join(logsDir, `unsupported-control-${timestamp}.log`);

  logStream = fs.createWriteStream(logFile, { flags: "a" });
  unsupportedControlStream = fs.createWriteStream(unsupportedControlFile, { flags: "a" });

  console.log(`Logging to: ${logFile}`);
  console.log(`Unsupported control requests logging to: ${unsupportedControlFile}`);
  return logFile;
}

function log(category, message, data = null) {
  const timestamp = new Date().toISOString();
  const prefix = `[${timestamp}] [${category}]`;

  let logLine;
  if (data) {
    const dataStr = JSON.stringify(data, null, 2);
    logLine = `${prefix} ${message}\n${dataStr}\n`;
    console.log(prefix, message, dataStr);
  } else {
    logLine = `${prefix} ${message}\n`;
    console.log(prefix, message);
  }

  if (logStream) {
    logStream.write(logLine);
  }
}

function closeLogger() {
  if (logStream) {
    logStream.end();
    logStream = null;
  }
  if (unsupportedControlStream) {
    unsupportedControlStream.end();
    unsupportedControlStream = null;
  }
}

function logUnsupportedControl(sessionId, fullMessage, context = {}) {
  const timestamp = new Date().toISOString();
  const separator = "=".repeat(80);

  const logEntry = `
${separator}
TIMESTAMP: ${timestamp}
SESSION_ID: ${sessionId}
${separator}

CONTEXT:
${JSON.stringify(context, null, 2)}

${separator}
FULL RAW MESSAGE (copy this for implementing support):
${JSON.stringify(fullMessage, null, 2)}

${separator}
IMPLEMENTATION GUIDE:
1. Add a new case in the handleControlRequest method for subtype: "${fullMessage.request?.subtype}"
2. Extract required fields from the request object
3. Create appropriate UI rendering in the client
4. Send back a control_response with the expected response structure
5. Test with the exact message structure shown above

REQUEST STRUCTURE ANALYSIS:
- Request ID: ${fullMessage.request_id}
- Request Subtype: ${fullMessage.request?.subtype}
- Request Fields: ${Object.keys(fullMessage.request || {}).join(", ")}

${separator}

`;

  console.log(`\n⚠️  UNSUPPORTED CONTROL REQUEST DETECTED - Session ${sessionId}`);
  console.log(`   Subtype: ${fullMessage.request?.subtype}`);
  console.log(`   Details logged to unsupported-control-*.log file\n`);

  if (unsupportedControlStream) {
    unsupportedControlStream.write(logEntry);
  }
}

function createServer(options = {}) {
  const config = {
    host: options.host ?? process.env.HOST ?? "127.0.0.1",
    port: Number(options.port ?? process.env.PORT ?? 3333),
    claudeBin: options.claudeBin ?? process.env.CLAUDE_BIN ?? "claude",
    defaultModel: options.defaultModel ?? process.env.CLAUDE_DEFAULT_MODEL ?? "",
    historyLimit: options.historyLimit ?? 200,
    spawnImpl: options.spawnImpl ?? spawn,
    enableLogging: options.enableLogging ?? true,
  };

  if (config.enableLogging && !logStream) {
    initLogger();
  }

  log("SERVER", "Creating server with config", config);

  const app = express();
  app.disable("x-powered-by");
  app.use(express.json({ limit: "1mb" }));

  app.use((req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "no-referrer");
    log("HTTP", `${req.method} ${req.path}`, {
      query: req.query,
      ip: req.ip,
      origin: req.get("origin")
    });
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
      log("SECURITY", "Forbidden origin rejected", { origin: req.get("origin") });
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
      log("SESSION", `Creating session ${this.id}`, { model: this.model });
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

      log("SESSION", `Starting Claude process for session ${this.id}`, {
        command: config.claudeBin,
        args: args
      });

      this.process = config.spawnImpl(config.claudeBin, args, { stdio: ["pipe", "pipe", "pipe"] });

      this.process.on("error", (err) => {
        log("CLAUDE_PROCESS", `Process error for session ${this.id}`, { error: err.message });
        this.status = "error";
        this.pushEvent("session_status", { status: this.status, error: err.message });
      });

      this.process.on("exit", (code, signal) => {
        log("CLAUDE_PROCESS", `Process exited for session ${this.id}`, { code, signal });
        this.status = "exited";
        this.pushEvent("session_status", { status: this.status, code, signal });
        this.closeSubscribers();
      });

      this.process.stderr.on("data", (buf) => {
        const message = buf.toString();
        log("CLAUDE_STDERR", `Session ${this.id}`, { message });
        this.pushEvent("claude_stderr", { message }, false);
      });

      this.readline = readline.createInterface({ input: this.process.stdout });
      this.readline.on("line", (line) => {
        if (!line.trim()) return;

        log("CLAUDE_STDOUT", `Session ${this.id} received`, { raw: line });

        let msg;
        try {
          msg = JSON.parse(line);
        } catch (parseError) {
          log("CLAUDE_STDOUT", `JSON parse error for session ${this.id}`, {
            error: parseError.message,
            line
          });
          this.pushEvent("error", { message: "Bad JSON from Claude", line }, false);
          return;
        }

        log("CLAUDE_STDOUT", `Session ${this.id} parsed message`, {
          type: msg.type,
          message: msg
        });

        if (msg.type === "control_request") {
          this.handleControlRequest(msg);
          return;
        }

        const assistantText = extractAssistantText(msg);
        if (assistantText) {
          log("CLAUDE_OUTPUT", `Session ${this.id} assistant text`, { text: assistantText });
          this.pushEvent("assistant_text", { text: assistantText });
        }

        this.pushEvent("claude_message", msg, false);
      });

      this.status = "running";
      log("SESSION", `Session ${this.id} status changed to running`);
      this.pushEvent("session_status", { status: this.status });
    }

    pushEvent(type, data, keep = true) {
      const event = {
        id: `${this.id}:${this.seq++}`,
        type,
        data,
        timestamp: nowIso(),
      };

      log("SSE", `Session ${this.id} pushing event ${type}`, {
        keep,
        subscribers: this.subscribers.size,
        eventData: data
      });

      if (keep) {
        this.history.push(event);
        if (this.history.length > config.historyLimit) this.history.shift();
      }

      for (const res of this.subscribers) {
        sendSse(res, type, event);
      }
    }

    addSubscriber(res) {
      log("SSE", `Session ${this.id} adding subscriber`, {
        totalSubscribers: this.subscribers.size + 1,
        historySize: this.history.length
      });

      this.subscribers.add(res);

      for (const event of this.history) {
        sendSse(res, event.type, event);
      }

      if (!this.heartbeat) {
        log("SSE", `Session ${this.id} starting heartbeat`);
        this.heartbeat = setInterval(() => {
          for (const client of this.subscribers) {
            client.write(": ping\n\n");
          }
        }, 20000);
      }
    }

    removeSubscriber(res) {
      this.subscribers.delete(res);
      log("SSE", `Session ${this.id} removing subscriber`, {
        remainingSubscribers: this.subscribers.size
      });

      if (this.subscribers.size === 0 && this.heartbeat) {
        log("SSE", `Session ${this.id} stopping heartbeat (no subscribers)`);
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
        log("CLAUDE_STDIN", `Session ${this.id} cannot send - process not available`, { obj });
        throw new Error("Claude process is not available");
      }

      const jsonStr = JSON.stringify(obj);
      log("CLAUDE_STDIN", `Session ${this.id} sending to Claude`, {
        type: obj.type,
        message: obj,
        raw: jsonStr
      });

      this.process.stdin.write(jsonStr + "\n");
    }

    sendUser(text, clientMessageId) {
      log("USER_MESSAGE", `Session ${this.id} user sent message`, {
        text,
        clientMessageId,
        textLength: text.length
      });

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
      log("CONTROL", `Session ${this.id} interrupt requested`);
      this.send({
        type: "control_request",
        request_id: makeId(),
        request: { subtype: "interrupt" },
      });
    }

    handleControlRequest(msg) {
      const request = msg.request || {};

      log("CONTROL", `Session ${this.id} control request received`, {
        subtype: request.subtype,
        requestId: msg.request_id,
        fullRequest: msg
      });

      if (request.subtype === "can_use_tool") {
        const entry = {
          requestId: msg.request_id,
          toolName: request.tool_name,
          input: request.input || {},
          suggestions: request.permission_suggestions || [],
          toolUseId: request.tool_use_id || null,
        };

        log("PERMISSION", `Session ${this.id} tool permission requested`, {
          toolName: entry.toolName,
          requestId: entry.requestId,
          input: entry.input
        });

        this.pendingPermissions.set(msg.request_id, entry);
        this.pushEvent("permission_request", entry);
        return;
      }

      log("CONTROL", `Session ${this.id} unsupported control request`, {
        subtype: request.subtype
      });

      // Log to dedicated unsupported control requests file with full details
      logUnsupportedControl(this.id, msg, {
        sessionStatus: this.status,
        model: this.model,
        pendingPermissions: this.pendingPermissions.size,
        messageHistorySize: this.messageHistory.length,
        lastMessages: this.messageHistory.slice(-3).map(m => ({
          type: m.type,
          timestamp: m.timestamp,
          // Include just the structure, not full content
          hasContent: !!m.message?.content,
          role: m.message?.role
        }))
      });

      this.send({
        type: "control_response",
        response: {
          subtype: "error",
          request_id: msg.request_id,
          error: `Unsupported control request subtype: ${request.subtype}`,
        },
      });
    }

    respondToPermission(requestId, decision, message, suggestion) {
      const entry = this.pendingPermissions.get(requestId);
      if (!entry) {
        log("PERMISSION", `Session ${this.id} permission request not found`, { requestId });
        throw new Error("Permission request not found");
      }

      log("PERMISSION", `Session ${this.id} permission decision`, {
        requestId,
        decision,
        toolName: entry.toolName,
        message,
        suggestion
      });

      this.pendingPermissions.delete(requestId);
      const behavior = decision === "allow" ? "allow" : "deny";

      // Build the response object
      const response = {
        behavior,
        toolUseID: entry.toolUseId,
      };

      if (behavior === "allow") {
        // For allow, we must provide updatedInput
        if (entry.toolName === "AskUserQuestion" && message) {
          // For AskUserQuestion, parse the message as updatedInput with answers
          try {
            response.updatedInput = JSON.parse(message);
          } catch (parseError) {
            log("PERMISSION", `Failed to parse AskUserQuestion answers`, {
              error: parseError.message,
              message
            });
            // Fall back to original input if parsing fails
            response.updatedInput = entry.input;
          }
        } else {
          // For other tools when allowing, use the original input as updatedInput
          response.updatedInput = entry.input;
        }

        // Include permission suggestion if provided
        if (suggestion) {
          response.applyPermissionSuggestion = suggestion;
        }
      } else {
        // For deny, use message field (must be non-empty per API requirements)
        response.message = message || "Permission denied by user";
      }

      this.send({
        type: "control_response",
        response: {
          subtype: "success",
          request_id: requestId,
          response,
        },
      });
    }

    close() {
      log("SESSION", `Closing session ${this.id}`, {
        status: this.status,
        subscribers: this.subscribers.size,
        pendingPermissions: this.pendingPermissions.size
      });

      if (this.readline) {
        this.readline.close();
        this.readline = null;
      }
      if (this.process && !this.process.killed) {
        log("CLAUDE_PROCESS", `Killing process for session ${this.id}`);
        this.process.kill("SIGTERM");
        setTimeout(() => {
          if (this.process && !this.process.killed) {
            log("CLAUDE_PROCESS", `Force killing process for session ${this.id}`);
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
    if (!session) {
      log("AUTH", `Session not found`, { sessionId: req.params.id });
      return res.status(404).json({ error: "Session not found" });
    }
    const token = getToken(req);
    if (!token || token !== session.token) {
      log("AUTH", `Invalid token for session ${req.params.id}`);
      return res.status(401).json({ error: "Invalid session token" });
    }
    req.session = session;
    return next();
  }

  app.get("/api/sessions", (req, res) => {
    const list = Array.from(sessions.values()).map((session) => session.info());
    log("API", `Listing sessions`, { count: list.length });
    res.json({ sessions: list });
  });

  app.post("/api/sessions", (req, res) => {
    const model = typeof req.body?.model === "string" ? req.body.model.trim() : "";
    log("API", `Creating new session`, { requestedModel: model });

    const session = new ClaudeSession({
      id: makeId(),
      token: makeId(24),
      model: model || config.defaultModel,
    });

    sessions.set(session.id, session);

    log("API", `Session created`, {
      id: session.id,
      model: session.model,
      totalSessions: sessions.size
    });

    res.json({
      id: session.id,
      token: session.token,
      model: session.model || null,
      createdAt: session.createdAt,
    });
  });

  app.get("/api/sessions/:id/stream", requireSession, (req, res) => {
    log("API", `Stream connection opened for session ${req.params.id}`);

    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });
    res.write("\n");

    req.session.addSubscriber(res);

    req.on("close", () => {
      log("API", `Stream connection closed for session ${req.params.id}`);
      req.session.removeSubscriber(res);
    });
  });

  app.post("/api/sessions/:id/send", requireSession, (req, res) => {
    const text = typeof req.body?.text === "string" ? req.body.text.trim() : "";
    if (!text) {
      log("API", `Send message failed - empty text`, { sessionId: req.params.id });
      return res.status(400).json({ error: "Text is required" });
    }

    log("API", `Sending user message to session ${req.params.id}`, {
      textLength: text.length,
      preview: text.substring(0, 100)
    });

    req.session.sendUser(text, req.body?.clientMessageId || null);
    return res.json({ ok: true });
  });

  app.post("/api/sessions/:id/interrupt", requireSession, (req, res) => {
    log("API", `Interrupt requested for session ${req.params.id}`);
    req.session.interrupt();
    res.json({ ok: true });
  });

  app.post("/api/sessions/:id/permissions", requireSession, (req, res) => {
    const requestId = typeof req.body?.requestId === "string" ? req.body.requestId : "";
    const decision = typeof req.body?.decision === "string" ? req.body.decision : "";
    const message = typeof req.body?.message === "string" ? req.body.message : "";
    const suggestion = req.body?.suggestion || null;

    log("API", `Permission response for session ${req.params.id}`, {
      requestId,
      decision,
      message,
      suggestion
    });

    if (!requestId) return res.status(400).json({ error: "requestId is required" });
    if (!decision || !["allow", "deny"].includes(decision)) {
      return res.status(400).json({ error: "decision must be allow or deny" });
    }

    try {
      req.session.respondToPermission(requestId, decision, message, suggestion);
      return res.json({ ok: true });
    } catch (err) {
      log("API", `Permission response error for session ${req.params.id}`, {
        error: err.message
      });
      return res.status(404).json({ error: err.message || "Permission not found" });
    }
  });

  app.delete("/api/sessions/:id", requireSession, (req, res) => {
    log("API", `Deleting session ${req.params.id}`);
    req.session.close();
    sessions.delete(req.session.id);
    log("API", `Session ${req.params.id} deleted`, { remainingSessions: sessions.size });
    res.json({ ok: true });
  });

  function closeAllSessions() {
    log("SERVER", `Closing all sessions`, { count: sessions.size });
    for (const session of sessions.values()) {
      session.close();
    }
    sessions.clear();
  }

  function createInitialSession(model) {
    const session = new ClaudeSession({
      id: makeId(),
      token: makeId(24),
      model: model || config.defaultModel,
    });
    sessions.set(session.id, session);
    return session;
  }

  function listen() {
    return app.listen(config.port, config.host, () => {
      log("SERVER", `Server started`, {
        url: `http://${config.host}:${config.port}`,
        claudeBin: config.claudeBin,
        defaultModel: config.defaultModel || "(none)"
      });
      console.log(`remote-claude running on http://${config.host}:${config.port}`);
      console.log(`Claude binary: ${config.claudeBin}`);
    });
  }

  return { app, listen, closeAllSessions, sessions, config, createInitialSession, closeLogger };
}

if (require.main === module) {
  const { listen, closeAllSessions, createInitialSession, config } = createServer();
  const server = listen();

  // Create an initial session and display QR code
  const session = createInitialSession();
  const publicHost = process.env.PUBLIC_HOST || config.host;
  const sessionUrl = `http://${publicHost}:${config.port}/#session=${session.id}&token=${session.token}`;

  console.log("\nScan the QR code to open this session on your phone:\n");
  qrcode.generate(sessionUrl, { small: true });
  console.log(`\nSession URL: ${sessionUrl}\n`);

  const shutdown = () => {
    log("SERVER", "Shutting down server");
    closeAllSessions();
    closeLogger();
    server.close(() => process.exit(0));
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

module.exports = { createServer };
