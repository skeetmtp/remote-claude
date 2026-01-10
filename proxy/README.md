# Claude CLI Proxy

A TypeScript/Node.js proxy for the `claude` CLI that preserves full interactive terminal behavior and connects to a web server via Server-Sent Events (SSE).

## Quick Start

```bash
# Initialize the project (install dependencies and fix permissions)
./bin.init.sh

# Run the proxy
npm run start -- --help
```

## Installation

### Automatic (Recommended)

```bash
./bin.init.sh
```

This script will:

- Install all npm dependencies
- Fix node-pty spawn-helper permissions automatically
- Display usage instructions

### Manual

```bash
npm install
chmod +x node_modules/node-pty/prebuilds/darwin-arm64/spawn-helper
```

## Usage

```bash
# Basic usage - pass any claude arguments
npm run start -- [claude-arguments]

# Examples
npm run start -- --help
npm run start -- --version
npm run start -- "Write a hello world function"

# With debug logging
DEBUG=proxy:* npm run start -- --help

# With custom SSE server URL
PROXY_SERVER_URL=http://example.com:8080 npm run start
```

## Features

### PTY-Based Spawning

- Spawns `~/.local/bin/claude` in a pseudo-terminal (PTY)
- Preserves full interactive terminal behavior
- Handles ANSI escape sequences and terminal control codes
- Supports terminal resizing

### Session Management

- Generates UUID v4 session IDs
- Passes session ID to claude via `--session-id` flag
- Tracks sessions throughout the proxy lifecycle

### SSE Connection

- Connects to web server at `http://localhost:3000/events` (configurable)
- Includes session ID as query parameter
- Automatic reconnection with exponential backoff:
  - Initial retry: 1 second
  - Multiplier: 2x
  - Maximum retry interval: 30 seconds
- Non-fatal connection failures (claude continues running)

### Event Handling

- **`retry` event**: Sends ESC + "retry" + ENTER to claude
- Unblocks claude when waiting for user permission

### Debug Logging

- Silent by default
- Enable with `DEBUG=proxy:*` environment variable
- Logs written to `logs/proxy-<timestamp>.log`
- Namespaces: `proxy:main`, `proxy:pty`, `proxy:sse`, `proxy:error`

## Configuration

### Environment Variables

- `PROXY_SERVER_URL` - Override SSE server URL (default: `http://localhost:3000`)
- `DEBUG` - Enable debug logging (e.g., `DEBUG=proxy:*`)

### Claude Binary Location

Default: `~/.local/bin/claude`

To use a different location, modify `src/config.ts`:

```typescript
const claudePath = '/path/to/your/claude';
```

## Architecture

```text
proxy/
├── src/
│   ├── index.ts         # Main entry point & orchestration
│   ├── pty-manager.ts   # PTY spawn & management
│   ├── sse-client.ts    # SSE connection & reconnection
│   ├── config.ts        # Configuration management
│   ├── logger.ts        # Debug logging
│   └── types.ts         # TypeScript interfaces
├── bin.init.sh          # Setup script
├── package.json         # Dependencies and scripts
└── tsconfig.json        # TypeScript configuration
```

## Development

```bash
# Install dependencies
npm install

# Run in development mode with auto-reload
npm run dev

# Build TypeScript
npm run build

# Run compiled version
node dist/index.js
```

## Troubleshooting

### "posix_spawnp failed" Error

This means the node-pty spawn-helper doesn't have execute permissions.

**Solution:**

```bash
./bin.init.sh
```

Or manually:

```bash
chmod +x node_modules/node-pty/prebuilds/darwin-arm64/spawn-helper
```

### Claude Binary Not Found

Ensure claude is installed at `~/.local/bin/claude`:

```bash
ls -la ~/.local/bin/claude
which claude
```

### SSE Connection Errors

SSE connection failures are non-fatal. The proxy will:

- Continue running claude normally
- Retry connection with exponential backoff
- Log connection attempts (with `DEBUG=proxy:sse`)

To see SSE connection details:

```bash
DEBUG=proxy:sse npm run start
```

## License

MIT
