
# Specification

You are creating a **new project from scratch**.
Do **not** scan existing codebases or reuse known implementations.

## Project goal

Implement a **CLI proxy** for the `claude` CLI that preserves **full interactive terminal behavior**.

## Language & structure

* Language: **TypeScript**
* Runtime: **Node.js**
* All project code **must live inside a `proxy/` directory**
* This is a brand-new project

## Critical requirement: terminal behavior

⚠️ **IMPORTANT**

The proxy **MUST NOT** use standard piped `stdin`, `stdout`, or `stderr` when spawning `claude`.

Instead:

* The proxy **MUST spawn `claude` inside a pseudo-terminal (PTY)**
* The `claude` CLI must believe it is running in a **real TTY**
* Interactive mode **will not work** if stdin/stdout are piped
* `claude` checks `isatty()` to enable interactive features

### Implications

* You **must use a PTY-based solution** (e.g. a Node PTY library)
* Input and output must flow **through the PTY**
* Terminal control characters (ESC, ENTER, etc.) must be supported
* Window resizing and raw terminal behavior should be preserved where possible

## Proxy behavior

* The proxy is a CLI program

* It launches the `claude` binary located at:

  ```bash
  ~/.local/bin/claude
  ```

* The proxy must:

  * Forward **user terminal input → PTY → claude**
  * Forward **claude PTY output → proxy stdout**
  * Preserve ANSI escape sequences and interactive behavior

* The proxy must pass **all command-line arguments it receives** directly to the `claude` CLI.

## Session ID

* When starting `claude`, the proxy must generate a **UUID v4** session ID

* Start `claude` with the additional argument:

  ```
  --session-id <uuid>
  ```

* The proxy must keep track of this session ID internally

## Web server connection

* The proxy must open a connection to a web server to receive events

* Default server URL:

  ```
  http://localhost:3000
  ```

* This must be overrideable via the environment variable:

  ```
  PROXY_SERVER_URL
  ```

## Event protocol

* Use **Server-Sent Events (SSE)**

* Endpoint:

  ```
  GET /events
  ```

* If a session ID exists, include it as a query parameter:

  ```
  /events?sessionId=<uuid>
  ```

* The connection is **server → proxy only**

## Supported events

### `retry`

When the proxy receives a `retry` event:

1. Send **ESC** to the running `claude` PTY
2. Then send the text:

   ```
   retry
   ```
3. Followed by **ENTER**

This is used to unblock `claude` when it is waiting for user permission.

## Reconnection behavior

* If the web server is unavailable or the SSE connection drops:

  * The proxy must retry connecting
  * Retry every **1 second**
  * Use exponential backoff
  * Cap the backoff at **30 seconds**
* Failure to connect to the web server must **not** stop or crash the proxy
* The `claude` process must continue running normally

## Out of scope

* Do **not** implement the server
* Assume the server already exists and follows the protocol
* Do **not** implement custom terminal emulation beyond what is required for PTY support

