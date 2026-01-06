"use strict";

const http = require("node:http");

function compilePath(pattern) {
  if (pattern === "/" || pattern === "") {
    return { regex: /^\/?$/, keys: [] };
  }
  const parts = pattern.split("/").filter(Boolean);
  const keys = [];
  const regexParts = parts.map((part) => {
    if (part.startsWith(":")) {
      keys.push(part.slice(1));
      return "([^/]+)";
    }
    return part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  });
  const regex = new RegExp(`^/${regexParts.join("/")}/?$`);
  return { regex, keys };
}

function createApp() {
  const middlewares = [];
  const routes = [];

  function app(req, res) {
    const host = req.headers.host || "localhost";
    const url = new URL(req.url, `http://${host}`);
    req.path = url.pathname;
    req.query = Object.fromEntries(url.searchParams.entries());
    req.params = {};
    req.get = (name) => req.headers[name.toLowerCase()];

    res.status = (code) => {
      res.statusCode = code;
      return res;
    };
    res.json = (obj) => {
      if (!res.headersSent) res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify(obj));
    };
    res.send = (value) => {
      if (typeof value === "object") return res.json(value);
      res.end(value);
    };

    let index = 0;
    function next() {
      const mw = middlewares[index++];
      if (mw) return mw(req, res, next);
      return dispatch();
    }

    function dispatch() {
      for (const route of routes) {
        if (route.method !== req.method) continue;
        const match = route.matcher.regex.exec(req.path);
        if (!match) continue;
        req.params = {};
        route.matcher.keys.forEach((key, i) => {
          req.params[key] = match[i + 1];
        });
        let handlerIndex = 0;
        const runHandler = () => {
          const handler = route.handlers[handlerIndex++];
          if (!handler) return;
          if (handler.length >= 3) return handler(req, res, runHandler);
          return handler(req, res);
        };
        return runHandler();
      }
      res.statusCode = 404;
      res.end("Not found");
    }

    next();
  }

  app.disable = () => {};
  app.use = (mw) => middlewares.push(mw);

  ["get", "post", "delete"].forEach((method) => {
    app[method] = (pattern, ...handlers) => {
      routes.push({
        method: method.toUpperCase(),
        pattern,
        matcher: compilePath(pattern),
        handlers,
      });
    };
  });

  app.listen = (port, host, cb) => {
    const server = http.createServer(app);
    return server.listen(port, host, cb);
  };

  return app;
}

function json() {
  return (req, res, next) => {
    if (req.method === "GET" || req.method === "HEAD") {
      req.body = {};
      return next();
    }
    const length = Number(req.headers["content-length"] || 0);
    if (!length && !req.headers["transfer-encoding"]) {
      req.body = {};
      return next();
    }
    let data = "";
    req.on("data", (chunk) => {
      data += chunk;
    });
    req.on("end", () => {
      if (!data) {
        req.body = {};
        return next();
      }
      const contentType = req.headers["content-type"] || "";
      if (contentType.includes("application/json")) {
        try {
          req.body = JSON.parse(data);
        } catch {
          req.body = {};
        }
      } else {
        req.body = {};
      }
      return next();
    });
  };
}

function staticMiddleware() {
  return (req, res, next) => next();
}

createApp.json = json;
createApp.static = staticMiddleware;

module.exports = createApp;
