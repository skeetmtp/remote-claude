# Claude Hook Plugin

A hook script for Claude CLI that forwards permission requests to a web server for remote approval.

## Installation

1. Make the script executable (already done):
   ```bash
   chmod +x hook.js
   ```

2. Register the hook in `~/.claude.json`:
   ```json
   {
     "hooks": {
       "PermissionRequest": [
         {
           "matcher": "*",
           "hooks": [
             {
               "type": "command",
               "command": "/path/to/claude-plugin/hook.js"
             }
           ]
         }
       ]
     }
   }
   ```

## Configuration

| Environment Variable | Default | Description |
|---------------------|---------|-------------|
| `WEB_SERVER_URL` | `http://localhost:3000` | Base URL of the web server |
| `DEBUG` | - | Set to `hook` to enable debug logging |

## How It Works

1. Claude CLI triggers the hook on permission requests
2. Hook receives JSON on stdin with request details
3. Hook POSTs the request to `${WEB_SERVER_URL}/api/hooks/permission`
4. Server responds with `{ exitCode, stdout }`
5. Hook outputs `stdout` and exits with `exitCode`

If the server is unavailable, the hook exits silently (code 0, no output), allowing Claude CLI to continue with its default permission flow.

## Server Response Format

```json
{
  "exitCode": 0,
  "stdout": "{\"hookSpecificOutput\":{\"hookEventName\":\"PermissionRequest\",\"decision\":{\"behavior\":\"allow\"}}}"
}
```

## Debug Logging

Enable logging to `/tmp/claude-hook.log`:

```bash
DEBUG=hook claude
```

## Testing

Run the test suite:

```bash
node test.js
```

Tests cover:
- Server down scenario (graceful exit)
- Successful responses with various exit codes
- Request body and headers validation
- Invalid JSON handling
- Server error handling
- Correct endpoint path
