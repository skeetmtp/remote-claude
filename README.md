# remote-claude

Multi-session web UI for Claude Code using stream-json over stdin/stdout. This is a local-only Express app that spawns a Claude CLI process per session and bridges messages over SSE + HTTP.

## Requirements

- Node.js 18+
- Claude Code CLI available on PATH, or set `CLAUDE_BIN`

## Quick start

```bash
cd /Users/alban/Downloads/remote-claude
npm install
npm start
```

Open:

```text
http://127.0.0.1:3333
```

## Project layout

- `server/` — Express server, Claude process manager, session routing, and SSE endpoints.
- `public/` — Static web UI (HTML/CSS/JS) served by the server.
- `FORMAT.md` — Complete specification of the Claude CLI stream-json protocol.

## Configuration

- `HOST` (default: `127.0.0.1`)
- `PORT` (default: `3333`)
- `CLAUDE_BIN` (default: `claude`)
- `CLAUDE_DEFAULT_MODEL` (default: empty)

Example:

```bash
HOST=127.0.0.1 PORT=3333 CLAUDE_BIN=/path/to/claude npm start
```

## Logging

All server activity is logged to both console and file. Logs are saved in the `logs/` directory with timestamped filenames (e.g., `server-2026-01-06T12-00-00-000Z.log`).

Log categories include:
- `CLAUDE_STDIN` / `CLAUDE_STDOUT` - Full stdin/stdout communication with Claude process
- `CLAUDE_STDERR` - Claude process error output
- `SESSION` - Session lifecycle events
- `API` - HTTP API operations
- `PERMISSION` - Tool permission requests/responses
- `HTTP` - All incoming requests

### Unsupported Control Request Logging

When Claude sends a control request that isn't yet supported, a dedicated log file is created:
- `logs/unsupported-control-*.log`

This log contains:
- Full JSON structure of the unsupported request
- Session context (status, model, recent messages)
- Step-by-step implementation guide
- All information needed to add support for the new control request

**See `UNSUPPORTED_CONTROL.md` for complete documentation on how to implement support for new control request types.**

Logs are useful for debugging and understanding Claude's message format for implementing new UI features. See `FORMAT.md` for the complete protocol specification.

## Notes

- Each session maps to a dedicated Claude CLI process.
- Permissions default to deny. The UI prompts for tool usage.
- The server is intended for local use only; it binds to `127.0.0.1` by default and checks same-origin requests.

## API (summary)

- `POST /api/sessions` -> create a session
- `GET /api/sessions` -> list sessions
- `GET /api/sessions/:id/stream?token=...` -> SSE stream
- `POST /api/sessions/:id/send` -> send a user message
- `POST /api/sessions/:id/interrupt` -> interrupt Claude
- `POST /api/sessions/:id/permissions` -> allow/deny tool usage
- `DELETE /api/sessions/:id` -> close session

## Test prompt

Prompt me with yes or no choice using multiple choice input
