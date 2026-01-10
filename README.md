# remote-claude

The goal of this project is to allow user to start a claude session on it's machine using cli in a terminal as usual.
The pain with original claude cli is that it is blocked when it ask for permission to use some tools. So the user need to come back to the terminal to approve the permission.
This project is a solution to this problem.

The idea is to start a claude session in a terminal as usual, but the claude cli can now be unblocked by the proxy when it ask for permission to use some tools.
On first PermissionRequest, the hook send requets data to the user in a SPA page running in the browser of user mobile phone.
The user can then chose to takeover the session from the mobile phone.
When user takeover the session, the web server send the takeover event to the proxy, the proxy simulate the user cancel the permission request and continue the session.
Now the claude cli will reask for permission, but the hook will now wait for the web server to send the request to the user, the user answer and the response is sent back and returned by the hook.

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

### Web app

The server accept connection from the proxy, proxy provide session id to the server, so the server know which session to send the event to.

User connect to the web app, using an url containing the session id.
Server reveive hooks events from claude, and send display last one in the UI of the web app.

Web app have 2 mode with a flag named 'takeover' that can be set to 'true' or 'false'.
takeover=false (default) : server display hooks events in the UI of the web app with a button to takeover the session.

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
