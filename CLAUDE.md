# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Remote Claude** is a solution that allows users to run Claude CLI sessions in a terminal while handling permission requests remotely via a web interface. It solves the problem of Claude CLI blocking when asking for tool permissions, enabling users to approve permissions from their mobile device or another browser window.

The project consists of three main components:
1. **Proxy CLI** (`/proxy`) - Wraps the Claude binary and manages terminal interaction
2. **Web App** (`/app`) - Full-stack application for remote permission handling
3. **Hook Plugin** (`extension.js`) - Claude CLI extension that intercepts permission requests

## Development Commands

### Proxy CLI
```bash
cd proxy
npm install           # Install dependencies
npm run dev           # Run with auto-reload
npm run build         # Build TypeScript to /dist
npm run start         # Run built version
```

### Web App
```bash
cd app
pnpm install          # Install dependencies (uses pnpm)
pnpm dev              # Start dev server on port 3000
pnpm build            # Build for production
pnpm test             # Run tests with Vitest
pnpm check            # Format and lint with auto-fix
```

## Architecture

### Component Communication Flow

```
User Terminal
     ↓ (stdio)
Proxy CLI
     ↓ (PTY spawn)
Claude Binary (~/.local/bin/claude --session-id <uuid>)
     ↓ (hook execution)
Hook Plugin → Web Server API
     ↓ (SSE connection)
Proxy CLI ← Web Server
     ↓ (browser)
User Interface (React SPA)
```

### Key Technical Details

#### 1. PTY-Based Proxy (`/proxy/src/`)
- **Purpose**: Spawns Claude CLI in a pseudo-terminal (PTY) to preserve full interactivity
- **Key Files**:
  - `index.ts` - Main entry point, orchestrates lifecycle
  - `pty-manager.ts` - Manages PTY process with node-pty
  - `sse-client.ts` - SSE client for receiving events from web server
  - `config.ts` - Configuration from environment variables

- **Flow**:
  1. Generates UUID session ID
  2. Spawns claude binary with `--session-id` argument
  3. Pipes stdin/stdout between user terminal and claude process
  4. Connects to web server via SSE (non-blocking)
  5. On "retry" event, sends ESC (waits 100ms), then "retry"+ENTER to unblock claude

- **Configuration**:
  - Claude binary path: `~/.local/bin/claude` (or CLAUDE_BIN env var)
  - SSE server URL: `http://localhost:3000` (or PROXY_SERVER_URL env var)
  - Retry sequence delay: `100ms` (or RETRY_SEQUENCE_DELAY_MS env var)
  - Retry logic: Exponential backoff (1s initial, 2x multiplier, 30s max)

#### 2. Web App (`/app/src/`)
- **Stack**:
  - **Framework**: React 19 + TanStack Router (file-based routing)
  - **Server**: TanStack Start + Nitro
  - **Styling**: Tailwind CSS 4 + shadcn/ui components
  - **Auth**: Better Auth with SQLite database
  - **Forms**: TanStack Form
  - **State**: TanStack React Query
  - **Build**: Vite

- **Routes Structure** (`/app/src/routes/`):
  - `__root.tsx` - Root layout
  - `index.tsx` - Home page
  - `login.tsx` / `signup.tsx` - Authentication pages
  - `dashboard.tsx` - Protected dashboard
  - `api/auth/$.ts` - Auth API handler

- **TypeScript Path Aliases** (defined in `tsconfig.json`):
  - `@/*` → `./src/*`
  - `@shared/*` → `./packages/shared/src/*`
  - `@db/*` → `./packages/db/src/*`
  - `@queues/*` → `./packages/queues/src/*`
  - `@ai/*` → `./packages/ai/src/*`

#### 3. Hook Plugin (`extension.js`)
- Registers with Claude CLI to intercept permission requests
- Configured in Claude config file:
  ```json
  {
    "hooks": {
      "PermissionRequest": [
        {
          "matcher": "*",
          "hooks": [
            {
              "type": "command",
              "command": "/path/to/extension.js"
            }
          ]
        }
      ]
    }
  }
  ```

### Session Management
- Each proxy session generates a unique UUID
- Session ID passed to Claude CLI via `--session-id <uuid>` flag
- Web server tracks sessions and routes events accordingly
- User connects to web app with session ID in URL

### Permission Handling Modes
1. **Default Mode (takeover=false)**:
   - Displays permission requests in web UI
   - User can click button to "takeover" session
   - Proxy sends retry sequence to unblock Claude CLI

2. **Takeover Mode (takeover=true)**:
   - Hook waits for web server response
   - User approves/denies from web interface
   - Response sent back through hook to Claude CLI

## Environment Configuration

### Proxy (via environment variables)
- `CLAUDE_BIN` - Path to claude binary (default: `~/.local/bin/claude`)
- `PROXY_SERVER_URL` - SSE server URL (default: `http://localhost:3000`)

### Web App (`/app/.env.development`)
```
HOST=0.0.0.0
PORT=3333
CLAUDE_BIN=claude
PUBLIC_HOST=albans-laptop
```

## Testing
- **Unit/Integration Tests**: Run `pnpm test` in `/app`
- **Test Framework**: Vitest with jsdom environment
- **Testing Library**: @testing-library/react

## Key Dependencies

### Proxy
- `node-pty` - Pseudo-terminal for spawning Claude process
- `eventsource` - SSE client implementation
- `uuid` - Session ID generation
- `debug` - Logging system

### Web App
- `@tanstack/react-start` - Full-stack React framework
- `@tanstack/react-router` - File-based routing
- `@tanstack/react-form` - Form management
- `better-auth` - Authentication system
- `nitro` - Server runtime
- `tailwindcss` + `@tailwindcss/vite` - Styling
- `shadcn/ui` components (via Radix UI)

## Important Notes

1. **PTY Preservation**: The proxy uses node-pty instead of simple child_process to maintain full terminal interactivity (colors, readline, etc.)

2. **Non-blocking SSE**: SSE connection is non-blocking - if web server is unavailable, proxy continues to work normally

3. **Terminal Resizing**: Proxy handles SIGWINCH and forwards resize events to PTY

4. **Graceful Shutdown**: Both SIGINT and SIGTERM trigger cleanup of SSE connection and PTY process

5. **Raw Mode**: When stdin is a TTY, proxy sets raw mode to properly forward all keystrokes

6. **Demo Routes**: `/app/src/routes/demo/` is excluded from production builds (see tsconfig.json)
