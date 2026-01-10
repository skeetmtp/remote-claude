#!/usr/bin/env node

import { createServer } from "node:http";

const host = process.env.HOST ?? "127.0.0.1";
const port = Number.parseInt(process.env.PORT ?? "3000", 10);

const server = createServer((req, res) => {
  const url = req.url ?? "/";
  if (url.startsWith("/events")) {
    const client = `${req.socket.remoteAddress ?? "unknown"}:${
      req.socket.remotePort ?? "?"
    }`;
    console.log(`[sse] connect ${client} ${url}`);
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });
    res.write(": ok\n\n");
    req.on("close", () => {
      console.log(`[sse] disconnect ${client}`);
    });
    return;
  }

  res.statusCode = 404;
  res.end("not found");
});

server.listen(port, host, () => {
  console.log(`[sse] listening on http://${host}:${port}/events`);
});

const shutdown = () => {
  console.log("[sse] shutting down");
  server.close(() => process.exit(0));
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
