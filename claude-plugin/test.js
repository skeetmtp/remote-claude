#!/usr/bin/env node

const http = require('http');
const { spawn } = require('child_process');
const path = require('path');
const assert = require('assert');

const HOOK_PATH = path.join(__dirname, 'hook.js');
const TEST_PORT = 3999;

// Test utilities
let server = null;
let serverHandler = null;

const startServer = (handler) => {
  return new Promise((resolve) => {
    serverHandler = handler;
    server = http.createServer((req, res) => {
      let body = '';
      req.on('data', (chunk) => (body += chunk));
      req.on('end', () => serverHandler(req, res, body));
    });
    server.listen(TEST_PORT, () => resolve());
  });
};

const stopServer = () => {
  return new Promise((resolve) => {
    if (server) {
      server.close(() => resolve());
      server = null;
    } else {
      resolve();
    }
  });
};

const runHook = (input, env = {}) => {
  return new Promise((resolve) => {
    const proc = spawn('node', [HOOK_PATH], {
      env: { ...process.env, ...env },
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (data) => (stdout += data));
    proc.stderr.on('data', (data) => (stderr += data));

    proc.on('close', (code) => {
      resolve({ code, stdout, stderr });
    });

    proc.stdin.write(JSON.stringify(input));
    proc.stdin.end();
  });
};

// Test cases
const tests = [
  {
    name: 'Server down - exits with code 0 and empty stdout',
    run: async () => {
      const result = await runHook(
        { session_id: 'test', tool_name: 'Bash' },
        { WEB_SERVER_URL: 'http://localhost:39999' } // Non-existent server
      );
      assert.strictEqual(result.code, 0, `Expected exit code 0, got ${result.code}`);
      assert.strictEqual(result.stdout, '', `Expected empty stdout, got "${result.stdout}"`);
    },
  },
  {
    name: 'Server returns exitCode 0 with stdout',
    run: async () => {
      await startServer((req, res, body) => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ exitCode: 0, stdout: 'allowed' }));
      });

      const result = await runHook(
        { session_id: 'test', tool_name: 'Bash' },
        { WEB_SERVER_URL: `http://localhost:${TEST_PORT}` }
      );

      await stopServer();

      assert.strictEqual(result.code, 0, `Expected exit code 0, got ${result.code}`);
      assert.strictEqual(result.stdout, 'allowed', `Expected "allowed", got "${result.stdout}"`);
    },
  },
  {
    name: 'Server returns exitCode 2 (deny)',
    run: async () => {
      await startServer((req, res, body) => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ exitCode: 2, stdout: 'denied' }));
      });

      const result = await runHook(
        { session_id: 'test', tool_name: 'Bash' },
        { WEB_SERVER_URL: `http://localhost:${TEST_PORT}` }
      );

      await stopServer();

      assert.strictEqual(result.code, 2, `Expected exit code 2, got ${result.code}`);
      assert.strictEqual(result.stdout, 'denied', `Expected "denied", got "${result.stdout}"`);
    },
  },
  {
    name: 'Server receives correct request body',
    run: async () => {
      let receivedBody = null;
      let receivedHeaders = null;

      await startServer((req, res, body) => {
        receivedBody = body;
        receivedHeaders = req.headers;
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ exitCode: 0, stdout: '' }));
      });

      const input = {
        session_id: 'abc123',
        hook_event_name: 'PermissionRequest',
        tool_name: 'Bash',
        tool_input: { command: 'echo hello' },
      };

      await runHook(input, { WEB_SERVER_URL: `http://localhost:${TEST_PORT}` });
      await stopServer();

      assert.strictEqual(receivedBody, JSON.stringify(input), 'Request body mismatch');
      assert.strictEqual(receivedHeaders['content-type'], 'application/json', 'Content-Type mismatch');
    },
  },
  {
    name: 'Server returns invalid JSON - exits with code 0',
    run: async () => {
      await startServer((req, res, body) => {
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end('not json');
      });

      const result = await runHook(
        { session_id: 'test', tool_name: 'Bash' },
        { WEB_SERVER_URL: `http://localhost:${TEST_PORT}` }
      );

      await stopServer();

      assert.strictEqual(result.code, 0, `Expected exit code 0 on invalid JSON, got ${result.code}`);
    },
  },
  {
    name: 'Server returns 500 error - exits with code 0',
    run: async () => {
      await startServer((req, res, body) => {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Internal Server Error' }));
      });

      const result = await runHook(
        { session_id: 'test', tool_name: 'Bash' },
        { WEB_SERVER_URL: `http://localhost:${TEST_PORT}` }
      );

      await stopServer();

      assert.strictEqual(result.code, 0, `Expected exit code 0 on server error, got ${result.code}`);
    },
  },
  {
    name: 'Server returns empty stdout - no output',
    run: async () => {
      await startServer((req, res, body) => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ exitCode: 0, stdout: '' }));
      });

      const result = await runHook(
        { session_id: 'test', tool_name: 'Bash' },
        { WEB_SERVER_URL: `http://localhost:${TEST_PORT}` }
      );

      await stopServer();

      assert.strictEqual(result.stdout, '', `Expected empty stdout, got "${result.stdout}"`);
    },
  },
  {
    name: 'Correct endpoint path is used',
    run: async () => {
      let requestPath = null;

      await startServer((req, res, body) => {
        requestPath = req.url;
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ exitCode: 0, stdout: '' }));
      });

      await runHook(
        { session_id: 'test', tool_name: 'Bash' },
        { WEB_SERVER_URL: `http://localhost:${TEST_PORT}` }
      );

      await stopServer();

      assert.strictEqual(requestPath, '/api/hooks', `Expected /api/hooks, got ${requestPath}`);
    },
  },
];

// Run tests
(async () => {
  console.log('Running hook.js tests...\n');

  let passed = 0;
  let failed = 0;

  for (const test of tests) {
    try {
      await test.run();
      console.log(`  ✓ ${test.name}`);
      passed++;
    } catch (error) {
      console.log(`  ✗ ${test.name}`);
      console.log(`    ${error.message}`);
      failed++;
    } finally {
      await stopServer();
    }
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
})();
