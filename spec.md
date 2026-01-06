# remote-claude Specification

## Purpose

Provide a **local-only** web UI that connects to the Claude Code CLI (or binary) over stdin/stdout using **newline-delimited JSON** (`stream-json` mode). The server spawns one Claude process **per session**, streams Claude output to the browser, and forwards tool permission prompts to the user. Default behavior is **deny unless explicitly approved**.

The spec is framework-agnostic so the app can be rewritten in any language/framework while preserving behavior.

## Core Concepts

### Sessions

- A session represents one Claude CLI process and its associated UI state.
- Each session has:
  - `id`: opaque identifier (string)
  - `token`: per-session secret (string), required for all session API calls and SSE streaming
  - `model`: optional string
  - `status`: `starting` | `running` | `error` | `exited` | `closed`
  - `createdAt`: ISO timestamp
- Sessions are stored in-memory only (no persistence across server restarts).

### Transport

- Claude is run with: `--input-format stream-json --output-format stream-json --permission-prompt-tool stdio`.
- All messages to Claude are JSON objects, one per line, written to stdin.
- All messages from Claude are JSON objects, one per line, read from stdout.

### Permissions

- Claude may send `control_request` with `subtype: "can_use_tool"`.
- The server must forward this as a permission prompt to the UI.
- The user explicitly allows or denies per request.
- Default is **deny** (no auto-allow).

### Streaming to UI

- Server-to-client uses **SSE** (Server-Sent Events).
- Client-to-server uses **HTTP POST**.

## CLI / Process Behavior

### Spawn Arguments

```bash
claude \
  --input-format stream-json \
  --output-format stream-json \
  --verbose \
  --permission-prompt-tool stdio \
  [--model <MODEL>]
```

### User Input Message

- On user send, server writes:

```json
{
  "type": "user",
  "session_id": "",
  "message": { "role": "user", "content": [{ "type": "text", "text": "..." }] },
  "parent_tool_use_id": null
}
```

### Interrupt

- On interrupt request, server writes:

```json
{
  "type": "control_request",
  "request_id": "<random>",
  "request": { "subtype": "interrupt" }
}
```

### Permission Response

- When user decides, server writes:

```json
{
  "type": "control_response",
  "response": {
    "subtype": "success",
    "request_id": "<request_id>",
    "response": {
      "behavior": "allow" | "deny",
      "message": "",
      "toolUseID": "<tool_use_id>"
    }
  }
}
```

## Server API

All session endpoints require a valid token. The token can be sent via:

- `Authorization: Bearer <token>` header, or
- `token` query parameter, or
- `token` field in request body.

### `POST /api/sessions`

Create a session.

Request:

```json
{ "model": "optional-model-string" }
```

Response:

```json
{ "id": "...", "token": "...", "model": "...", "createdAt": "..." }
```

### `GET /api/sessions`

List sessions.

Response:

```json
{ "sessions": [ { "id": "...", "model": "...", "createdAt": "...", "status": "running" } ] }
```

### `GET /api/sessions/:id/stream?token=...`

SSE stream for server->client events.

Events:

- `session_status` with `{ status, code?, signal?, error? }`
- `user_message` with `{ text, clientMessageId? }`
- `assistant_text` with `{ text }` (streamed text chunks or full messages)
- `permission_request` with `{ requestId, toolName, input, suggestions, toolUseId }`
- `claude_stderr` with `{ message }`
- `error` with `{ message, line? }`

### `POST /api/sessions/:id/send`

Send a user message.

Request:

```json
{ "text": "...", "clientMessageId": "optional" }
```

Response:

```json
{ "ok": true }
```

### `POST /api/sessions/:id/interrupt`

Interrupt Claude.

Response:

```json
{ "ok": true }
```

### `POST /api/sessions/:id/permissions`

Allow/deny a tool request.

Request:

```json
{ "requestId": "...", "decision": "allow" | "deny", "message": "optional" }
```

Response:

```json
{ "ok": true }
```

### `DELETE /api/sessions/:id`

Close a session and terminate its process.

Response:

```json
{ "ok": true }
```

## UI Requirements

### Layout

- Sidebar with:
  - App title
  - Model input (optional)
  - “New session” button
  - Session list (shows id, status, model, created time)
- Main chat area with:
  - Header showing active session metadata
  - Messages list (user/assistant/system)
  - Input composer
  - Buttons: Interrupt, Close

### Behavior

- Session creation spawns a new Claude process and opens stream.
- Messages appear in real time.
- Permission requests open a modal; user chooses Allow/Deny.
- Default for permission is deny (user must explicitly allow).
- If stream disconnects, UI shows a system message.

### Token Storage

- Client stores session tokens locally (e.g., localStorage) to reconnect.
- Tokens are never displayed in the UI.

## Security Constraints

- Intended for **local use only**. Default bind host: `127.0.0.1`.
- Same-origin checks on API requests.
- Per-session token required for all session operations.
- No external network access required by the server.

## Configuration

Environment variables:

- `HOST` (default `127.0.0.1`)
- `PORT` (default `3333`)
- `CLAUDE_BIN` (default `claude`)
- `CLAUDE_DEFAULT_MODEL` (default empty)

## Error Handling

- Malformed JSON from CLI must not crash the server; emit an `error` SSE event.
- Process errors and exit are pushed via `session_status`.
- If permission response references unknown requestId, return `404`.
- If token missing/invalid, return `401`.
- If session missing, return `404`.

## Non-Goals

- Not a hosted multi-tenant service.
- No external authentication/authorization.
- No persistent session storage.
- No full VS Code extension parity (e.g., editor integrations, MCP server management).

## Implementation Notes (informative)

- The current reference implementation uses Express + SSE; any framework with HTTP + SSE or WebSockets is acceptable.
- Message parsing should handle line-by-line JSON.
- It is acceptable to also emit full Claude messages as raw JSON for debugging, but the UI should consume `assistant_text` for display.
