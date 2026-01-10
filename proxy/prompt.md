# Specification

Create a proxy to claude, all code should live in proxy/ directory.
This is a new project, from scratch, do not scan existing code for inspiration.
The proxy is a cli written in typescript that pipe both stdin and stdout to the claude binary (~/.local/bin/claude).
proxy start claude cli with a --session-id uuid4 argument so proxy knows the session id claude is running in.

see help:

```text
--session-id <uuid>                               Use a specific session ID for the conversation (must be a valid UUID)
```

proxy should pass all arguments received from the command line to the claude cli.

proxy open a connection to the web server at `http://localhost:3000` (can be overriden with PROXY_SERVER_URL env variable), to receive events from the web server.

The events are:

- 'retry' : The idea is to unblock the claude cli if it is blocked on a ask for permission.
  - send to claude 'esc' and type 'retry'+'enter'

If web server is down, it's not a problem, proxy will retry to connect to the web server every 1 second with backoff capped at 30 seconds.

Coding the server side is outside the scope of this project, let pretend the server side is already coded and working.

proxy should not pass --session-id in some cases, run claude --help to see when it's not needed.

What exact protocol/endpoint should the proxy use to receive events ?


---

Here is a **clean, self-contained prompt** you can give to an LLM to generate the project.

---

### Prompt

You are creating a **new project from scratch**.
Do **not** scan existing codebases or reuse known implementations.

## Project goal

Implement a **CLI proxy** for the `claude` CLI.

## Language & structure

* Language: **TypeScript**
* Runtime: **Node.js**
* All project code **must live inside a `proxy/` directory**
* This is a brand-new project

## Proxy behavior

* The proxy is a CLI program
* It launches the `claude` binary located at:

  ```
  ~/.local/bin/claude
  ```
* The proxy must:

  * Pipe **stdin → claude stdin**
  * Pipe **claude stdout → proxy stdout**
  * Pipe **claude stderr → proxy stderr**
* The proxy must pass **all command-line arguments it receives** directly to the `claude` CLI.

## Session ID

* When starting `claude`, the proxy must generate a **UUID v4** session ID.
* Start `claude` with:

  ```
  --session-id <uuid>
  ```
* The proxy must keep track of this session ID internally.

## Web server connection

* The proxy must open a connection to a web server to receive events.
* Default server URL:

  ```
  http://localhost:3000
  ```
* This must be overrideable via the environment variable:

  ```
  PROXY_SERVER_URL
  ```

## Event protocol

* Use **Server-Sent Events (SSE)**.
* Endpoint:

  ```
  GET /events
  ```
* If a session ID exists, include it as a query parameter:

  ```
  /events?sessionId=<uuid>
  ```
* The connection is **server → proxy only**.

## Supported events

### `retry`

When the proxy receives a `retry` event:

1. Send **ESC** to the running `claude` process
2. Then send the text:

   ```
   retry
   ```
3. Followed by **ENTER**

This is used to unblock `claude` when it is waiting for user permission.

## Reconnection behavior

* If the web server is unavailable or the connection drops:

  * The proxy must retry connecting
  * Retry every **1 second**
  * Use exponential backoff
  * Cap the backoff at **30 seconds**
* Failure to connect to the web server must **not** stop or crash the proxy.

## Out of scope

* Do **not** implement the server
* Assume the server already exists and follows the protocol

## Deliverables

* Complete TypeScript source code
* Clear project structure under `proxy/`
* CLI entrypoint
* Minimal but correct dependencies
* Code should be readable, robust, and production-oriented

