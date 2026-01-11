# remote-claude

The goal of this project is to allow user to start a claude session on it's machine using cli in a terminal as usual.
The pain with original claude cli is that it is blocked when it ask for permission to use some tools. So the user need to come back to the terminal to approve the permission.
This project is a solution to this problem.

The idea is to start a claude session in a terminal as usual, but the claude cli can now be unblocked remotely when it asks for permission or user input.
When the hook detects a request, it sends the request data to a web server, which displays it in a SPA page running in the browser (on user's mobile phone or any device).
The user can then respond to the request through the web interface.
The web server sends an 'override' event to the proxy with the user's response, and the proxy types that response on the TTY on behalf of the user.

The project is composed of the following parts:

- a proxy cli to claude binary (~/.local/bin/claude) that pipe both stdin and stdout to the claude binary.

- a web app with it's own server and client.

- a claude plugin that registers hooks in claude config.

## Project structure

├── app/
├── proxy/
└── README.md

## How it works

### Proxy

The proxy is a cli written in typescript that pipe both stdin and stdout to the claude binary.
proxy start claude cli with a --session-id uuid4 argument so procy knowsthe session id claude is running in.

see help:

```text
--session-id <uuid>                               Use a specific session ID for the conversation (must be a valid UUID)
```

proxy open a connection to the web server, to receive events from the web server.
The events are:

- 'retry' : The idea is to unblock the claude cli if it is blocked on a ask for permission.
  - send to claude 'esc' and type 'retry'+'enter'

- 'override' : Send a custom prompt to claude
  - receives prompt text in the event data field
  - send to claude 'esc' and type '<prompt>'+'enter'

### Web app

The server accept connection from the proxy, proxy provide session id to the server, so the server know which session to send the event to.

User connect to the web app, using an url containing the session id.
Server receives hook events from claude, and displays them in the UI of the web app.

When claude blocks waiting for user input, the user can respond through the web app interface.
The web server sends the user's response as an 'override' event to the proxy, which types it on the TTY.

### Claude Plugin

Register this hook in claude config:

```json
    "PermissionRequest": [
      {
        "matcher": "*",
        "hooks": [
          {
            "type": "command",
            "command": "proxy/hook-prompt.js"
          }
        ]
      }
    ]
```

### Flow

claude <-> hook <-> web server api <-> SPA page <-> user mobile phone
       <-> proxy <-> web server

### Tech stack

- typescript
- react
- tailwindcss
- shadcn/ui

## How to use

```bash
claude --model sonnet "ask user question using tool: 'are you happy ? yes or no'" --debug
claude --model sonnet "run echo 'foo' > foo.txt' command" --debug
```

Example of claude config:

```json
{
  "permissions": {
    "allow": [
      "Bash(npm install:*)",
      "Bash(node --check:*)",
      "WebFetch(domain:github.com)",
      "Bash(head:*)"
    ]
  },
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "*",
        "hooks": [
          {
            "type": "command",
            "command": "/Users/alban/Developer/tanstack/remote-claude/hook-prompt.js -a"
          }
        ]
      }
    ],
    "PermissionRequest": [
      {
        "matcher": "*",
        "hooks": [
          {
            "type": "command",
            "command": "/Users/alban/Developer/tanstack/remote-claude/hook-prompt.js -s 0"
          }
        ]
      }
    ]
  }
}
```
