#!/usr/bin/env node

const fs = require('fs');

// Configuration
const WEB_SERVER_URL = process.env.WEB_SERVER_URL || 'http://localhost:3000';
const ENDPOINT = '/api/hooks';
const TIMEOUT_MS = 30000;
const DEBUG = process.env.DEBUG?.includes('hook');
const LOG_FILE = '/tmp/claude-hook.log';

// Logging helper (only when DEBUG=hook)
const log = (msg) => {
  if (DEBUG) {
    fs.appendFileSync(LOG_FILE, `[${new Date().toISOString()}] ${msg}\n`);
  }
};

log('starting hook');
log('WEB_SERVER_URL: ' + WEB_SERVER_URL);

// Read stdin into buffer
let inputData = '';
process.stdin.on('data', (chunk) => {
  inputData += chunk;
});

// On stdin end, make HTTP request
process.stdin.on('end', async () => {
  log(`Input: ${inputData}`);

  try {
    const url = `${WEB_SERVER_URL}${ENDPOINT}`;
    log(`POSTing to ${url}`);

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: inputData,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    const result = await response.json();
    log(`Response: ${JSON.stringify(result)}`);

    // Output stdout and exit with specified code
    if (result.stdout) {
      process.stdout.write(result.stdout);
    }
    log('exiting with code ' + (result.exitCode ?? 0));
    process.exit(result.exitCode ?? 0);
  } catch (error) {
    // Server down or error - exit silently
    log(`Error: ${error.message}`);
    log('exiting with code 0');
    process.exit(0);
  }
});
