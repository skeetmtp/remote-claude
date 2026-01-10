# Claude Proxy

`claude-proxy` is a small TypeScript CLI that wraps the `claude` binary, pipes
stdin/stdout/stderr through, and listens to a local SSE control channel for
remote retry events.

## Behavior

- Launches `~/.local/bin/claude` (override with `CLAUDE_BIN`) and forwards all
  CLI arguments, plus `--session-id <uuid-v4>`.
- Pipes stdin → claude stdin, claude stdout → stdout, and claude stderr → stderr.
- Connects to an SSE endpoint at `<server>/events?sessionId=<uuid>`.
- On `retry` events, sends ESC + `retry` + ENTER to the running claude process.
- Reconnects to the SSE server with exponential backoff (default 1s → 30s cap).

## Requirements

- Node.js >= 22
- `claude` installed at `~/.local/bin/claude` (or set `CLAUDE_BIN`)

## Install

```sh
cd proxy
pnpm install
```

## Usage

```sh
pnpm dev -- --model sonnet
```

Build and run the compiled CLI:

```sh
pnpm build
pnpm start -- --model sonnet
```

## Configuration

- `PROXY_SERVER_URL`: Base server URL (default `http://localhost:3000`).
- `CLAUDE_BIN`: Path to the `claude` binary (default `~/.local/bin/claude`).
- `BACKOFF_INITIAL_MS`: Initial SSE reconnect delay in ms (default `1000`).
- `BACKOFF_MAX_MS`: Max SSE reconnect delay in ms (default `30000`).

## SSE Protocol

The proxy connects via Server-Sent Events to:

```http
GET /events?sessionId=<uuid>
```

Supported events:

- `retry`: triggers ESC + `retry` + newline on claude stdin.

## Tests

```sh
pnpm test
```
