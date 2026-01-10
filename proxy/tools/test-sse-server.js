#!/usr/bin/env node

/**
 * Minimal SSE Test Server for Proxy Testing
 *
 * This server allows quick testing of the proxy <-> SSE server connection.
 * It accepts SSE connections from the proxy and allows triggering events via stdin.
 *
 * Usage:
 *   node test-sse-server.js
 *   PORT=3001 node test-sse-server.js
 */

const http = require('http');
const readline = require('readline');
const { URL } = require('url');

// Configuration
const PORT = process.env.PORT || 3000;
const HOST = '0.0.0.0';

// Active SSE connections: Map<sessionId, response>
const sessions = new Map();

/**
 * Send an SSE event to a specific session
 */
function sendEvent(sessionId, eventType, data) {
  const response = sessions.get(sessionId);
  if (!response) {
    console.log(`[ERROR] Session not found: ${sessionId}`);
    return false;
  }

  try {
    const payload = typeof data === 'string' ? data : JSON.stringify(data);
    response.write(`event: ${eventType}\n`);
    response.write(`data: ${payload}\n\n`);
    return true;
  } catch (error) {
    console.log(`[ERROR] Failed to send event to ${sessionId}:`, error.message);
    // Remove dead connection
    sessions.delete(sessionId);
    return false;
  }
}

/**
 * HTTP request handler
 */
function handleRequest(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);

  // CORS headers (useful for web testing)
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Handle OPTIONS preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // SSE endpoint: GET /events?sessionId=<uuid>
  if (req.method === 'GET' && url.pathname === '/events') {
    const sessionId = url.searchParams.get('sessionId');

    if (!sessionId) {
      res.writeHead(400, { 'Content-Type': 'text/plain' });
      res.end('Missing sessionId query parameter');
      return;
    }

    // Setup SSE headers
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    });

    // Send initial comment to establish connection
    res.write(': connected\n\n');

    // Store session
    sessions.set(sessionId, res);
    console.log(`[CONNECT] Session connected: ${sessionId} (total: ${sessions.size})`);

    // Handle client disconnect
    req.on('close', () => {
      sessions.delete(sessionId);
      console.log(`[DISCONNECT] Session disconnected: ${sessionId} (total: ${sessions.size})`);
    });

    return;
  }

  // Health check endpoint
  if (req.method === 'GET' && url.pathname === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: 'ok',
      sessions: sessions.size,
      timestamp: new Date().toISOString()
    }));
    return;
  }

  // 404 for all other routes
  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end('Not Found');
}

/**
 * Process stdin commands
 */
function processCommand(line) {
  const parts = line.trim().split(/\s+/);
  const command = parts[0].toLowerCase();

  switch (command) {
    case 'help':
      console.log('\nAvailable commands:');
      console.log('  retry <sessionId>  - Send retry event to specific session');
      console.log('  retry all          - Send retry event to all connected sessions');
      console.log('  list               - Show all connected session IDs');
      console.log('  help               - Display this help message');
      console.log('  exit               - Shutdown server\n');
      break;

    case 'list':
      if (sessions.size === 0) {
        console.log('No connected sessions');
      } else {
        console.log(`\nConnected sessions (${sessions.size}):`);
        for (const sessionId of sessions.keys()) {
          console.log(`  - ${sessionId}`);
        }
        console.log('');
      }
      break;

    case 'retry':
      if (parts.length < 2) {
        console.log('[ERROR] Usage: retry <sessionId> or retry all');
        break;
      }

      const target = parts[1];
      if (target === 'all') {
        let count = 0;
        const data = { triggeredAt: new Date().toISOString() };
        for (const sessionId of sessions.keys()) {
          if (sendEvent(sessionId, 'retry', data)) {
            count++;
          }
        }
        console.log(`[SENT] Retry event sent to ${count} session(s)`);
      } else {
        const data = { triggeredAt: new Date().toISOString() };
        if (sendEvent(target, 'retry', data)) {
          console.log(`[SENT] Retry event sent to session: ${target}`);
        }
      }
      break;

    case 'exit':
    case 'quit':
      console.log('\nShutting down server...');
      process.exit(0);
      break;

    case '':
      // Ignore empty lines
      break;

    default:
      console.log(`[ERROR] Unknown command: ${command}`);
      console.log('Type "help" for available commands');
      break;
  }
}

/**
 * Start the server
 */
const server = http.createServer(handleRequest);

server.listen(PORT, HOST, () => {
  console.log('='.repeat(60));
  console.log('  Minimal SSE Test Server');
  console.log('='.repeat(60));
  console.log(`Server listening on http://${HOST}:${PORT}`);
  console.log(`SSE endpoint: http://${HOST}:${PORT}/events?sessionId=<uuid>`);
  console.log(`Health check: http://${HOST}:${PORT}/health`);
  console.log('\nType "help" for available commands\n');
});

// Setup stdin interface
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  prompt: '> '
});

rl.prompt();

rl.on('line', (line) => {
  processCommand(line);
  rl.prompt();
});

rl.on('close', () => {
  console.log('\nShutting down server...');
  process.exit(0);
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n\nReceived SIGINT, shutting down gracefully...');
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

process.on('SIGTERM', () => {
  console.log('\nReceived SIGTERM, shutting down gracefully...');
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});
