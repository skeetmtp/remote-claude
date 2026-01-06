# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

remote-claude is a local-only web UI that connects to Claude Code CLI over stdin/stdout using newline-delimited JSON (`stream-json` mode). The server spawns one Claude process per session, streams output to the browser via SSE, and forwards tool permission prompts to the user.

See `FORMAT.md` for the complete stdin/stdout protocol specification.

## Commands

```bash
# Start the server (default: http://127.0.0.1:3333)
npm start

# Run tests
npm test
```

## Configuration

Environment variables:
- `HOST` - bind address (default: `127.0.0.1`)
- `PORT` - port number (default: `3333`)
- `CLAUDE_BIN` - path to claude binary (default: `claude`)
- `CLAUDE_DEFAULT_MODEL` - default model string
- `PUBLIC_HOST` - hostname for QR code URLs (default: same as HOST)

## Logging

Server logs all activity to both console and file (`logs/server-<timestamp>.log`). Every stdin/stdout message to/from the Claude process is logged with full JSON payloads for debugging and UI development.

## Architecture

### Server (`server/index.js`)

Express server with `createServer()` factory function that returns `{ app, listen, closeAllSessions, sessions, config, createInitialSession }`.

Key components:
- **ClaudeSession class**: Manages a single Claude CLI process, handles stdin/stdout communication, tracks SSE subscribers, and maintains message history
- **Session lifecycle**: `starting` -> `running` -> `exited`/`closed`/`error`
- **Authentication**: Per-session tokens required for all session operations (Bearer header, query param, or body)

Claude CLI spawn arguments:
```bash
claude --input-format stream-json --output-format stream-json --verbose --permission-prompt-tool stdio [--model <MODEL>]
```

### Client (`public/app.js`)

Vanilla JS single-page app that:
- Stores session tokens in localStorage
- Connects to session streams via SSE (`EventSource`)
- Handles permission request modals with allow/deny flow
- Supports URL hash params for session sharing (`#session=<id>&token=<token>`)

### API Endpoints

- `POST /api/sessions` - Create session
- `GET /api/sessions` - List sessions
- `GET /api/sessions/:id/stream?token=` - SSE stream
- `POST /api/sessions/:id/send` - Send user message
- `POST /api/sessions/:id/interrupt` - Interrupt Claude
- `POST /api/sessions/:id/permissions` - Allow/deny tool request
- `DELETE /api/sessions/:id` - Close session

### SSE Events

`session_status`, `user_message`, `assistant_text`, `permission_request`, `claude_stderr`, `error`, `claude_message`

### Special Tool Handling

**AskUserQuestion**: When Claude uses the `AskUserQuestion` tool to prompt the user with questions:
- The client detects `toolName === "AskUserQuestion"` in permission requests
- Renders a custom question UI with the provided options (radio buttons or checkboxes)
- Collects user answers and sends them back via the permissions endpoint
- Answers are formatted as `{ answers: { "0": "Yes", "1": ["Option1", "Option2"] } }` where keys are question indices

### Testing

Tests use Node's built-in test runner with a custom Express stub (`test/express-stub.js`) and fake spawn implementation to simulate Claude process behavior without actual CLI invocation.
