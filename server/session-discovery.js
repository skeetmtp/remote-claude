const fs = require("fs");
const path = require("path");
const os = require("os");
const readline = require("readline");

/**
 * Get the Claude projects path for the current working directory
 * Claude stores sessions at ~/.claude/projects/-<cwd-with-dashes>/
 */
function getProjectSessionsPath(cwd = process.cwd()) {
  const claudeDir = path.join(os.homedir(), ".claude", "projects");
  // Convert path to Claude's naming convention: replace / with -
  const projectFolder = cwd.replace(/\//g, "-");
  return path.join(claudeDir, projectFolder);
}

/**
 * Parse the first line of a JSONL file to extract the summary
 */
async function parseSessionSummary(filePath) {
  return new Promise((resolve) => {
    const stream = fs.createReadStream(filePath, { encoding: "utf8" });
    const rl = readline.createInterface({ input: stream });
    let resolved = false;

    rl.on("line", (line) => {
      if (resolved) return;
      resolved = true;
      rl.close();
      stream.destroy();
      try {
        const obj = JSON.parse(line);
        if (obj.type === "summary" && obj.summary) {
          resolve(obj.summary);
        } else {
          resolve(null);
        }
      } catch {
        resolve(null);
      }
    });

    rl.on("close", () => {
      if (!resolved) {
        resolved = true;
        resolve(null);
      }
    });
    rl.on("error", () => {
      if (!resolved) {
        resolved = true;
        resolve(null);
      }
    });
  });
}

/**
 * List recent sessions sorted by modification time
 * @param {number} limit - Maximum number of sessions to return
 * @returns {Promise<Array<{id: string, summary: string, mtime: Date, path: string}>>}
 */
async function listSessions(limit = 10) {
  const sessionsPath = getProjectSessionsPath();

  if (!fs.existsSync(sessionsPath)) {
    return [];
  }

  const files = fs.readdirSync(sessionsPath);
  const sessions = [];

  for (const file of files) {
    // Only process .jsonl files, skip agent files
    if (!file.endsWith(".jsonl") || file.startsWith("agent-")) {
      continue;
    }

    const filePath = path.join(sessionsPath, file);
    const stats = fs.statSync(filePath);

    // Skip empty files
    if (stats.size === 0) {
      continue;
    }

    const sessionId = file.replace(".jsonl", "");
    const summary = await parseSessionSummary(filePath);

    // Skip sessions without a proper summary
    if (!summary || summary === "warmup" || summary === "(no summary)") {
      continue;
    }

    sessions.push({
      id: sessionId,
      summary: summary,
      mtime: stats.mtime,
      path: filePath,
    });
  }

  // Sort by modification time, most recent first
  sessions.sort((a, b) => b.mtime - a.mtime);

  return sessions.slice(0, limit);
}

/**
 * Extract text content from a message content array or string
 */
function extractTextFromContent(content) {
  if (typeof content === "string") {
    return content;
  }
  if (Array.isArray(content)) {
    return content
      .filter((item) => item.type === "text")
      .map((item) => item.text)
      .join("\n");
  }
  return "";
}

/**
 * Get the full message history for a session
 * @param {string} sessionId - The session UUID
 * @returns {Promise<Array<{role: string, text: string, timestamp: string}>>}
 */
async function getSessionHistory(sessionId) {
  const sessionsPath = getProjectSessionsPath();
  const filePath = path.join(sessionsPath, `${sessionId}.jsonl`);

  if (!fs.existsSync(filePath)) {
    return [];
  }

  return new Promise((resolve, reject) => {
    const messages = [];
    const stream = fs.createReadStream(filePath, { encoding: "utf8" });
    const rl = readline.createInterface({ input: stream });

    rl.on("line", (line) => {
      try {
        const obj = JSON.parse(line);

        // Skip non-message entries (summary, file-history-snapshot, etc.)
        const validTypes = ["user", "assistant"];
        if (!validTypes.includes(obj.type)) {
          return;
        }

        // Skip meta messages
        if (obj.isMeta) {
          return;
        }

        // Extract the text content
        const content = obj.message?.content;
        const text = extractTextFromContent(content);

        // Skip empty messages
        if (!text.trim()) {
          return;
        }

        messages.push({
          role: obj.type,
          text: text,
          timestamp: obj.timestamp || "",
        });
      } catch {
        // Skip malformed lines
      }
    });

    rl.on("close", () => resolve(messages));
    rl.on("error", reject);
  });
}

/**
 * Format a relative time string (e.g., "2 min ago", "1 hour ago")
 */
function formatRelativeTime(date) {
  const now = new Date();
  const diffMs = now - date;
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);

  if (diffMin < 1) {
    return "just now";
  } else if (diffMin < 60) {
    return `${diffMin} min ago`;
  } else if (diffHour < 24) {
    return `${diffHour} hour${diffHour > 1 ? "s" : ""} ago`;
  } else {
    return `${diffDay} day${diffDay > 1 ? "s" : ""} ago`;
  }
}

module.exports = {
  getProjectSessionsPath,
  listSessions,
  getSessionHistory,
  formatRelativeTime,
};
