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

## Configuration

- `HOST` (default: `127.0.0.1`)
- `PORT` (default: `3333`)
- `CLAUDE_BIN` (default: `claude`)
- `CLAUDE_DEFAULT_MODEL` (default: empty)

Example:

```bash
HOST=127.0.0.1 PORT=3333 CLAUDE_BIN=/path/to/claude npm start
```

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
