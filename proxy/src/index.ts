#!/usr/bin/env node

import * as fs from 'fs';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { setupLogging, logger } from './logger';
import { loadConfig } from './config';
import { PTYManager } from './pty-manager';
import { SSEClient } from './sse-client';
import { displaySessionQR } from './qr-display';

/**
 * Parse proxy-specific arguments from CLI args
 * Returns the cwd option and remaining args to pass to claude
 */
function parseProxyArgs(args: string[]): { cwd?: string; claudeArgs: string[] } {
  const claudeArgs: string[] = [];
  let cwd: string | undefined;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--cwd' && i + 1 < args.length) {
      cwd = path.resolve(args[i + 1]);
      i++; // Skip the next argument (the path)
    } else {
      claudeArgs.push(args[i]);
    }
  }

  return { cwd, claudeArgs };
}

/**
 * Main entry point for the proxy
 */
async function main() {
  // 1. Setup logging
  setupLogging();
  logger.main('Starting claude proxy');

  // 2. Load config
  const config = loadConfig();
  logger.main(`Configuration loaded: ${JSON.stringify(config)}`);

  // 3. Validate claude binary exists
  if (!fs.existsSync(config.claudePath)) {
    console.error(`Error: claude binary not found at ${config.claudePath}`);
    process.exit(1);
  }

  // 4. Generate session ID
  const sessionId = uuidv4();
  logger.main(`Session ID: ${sessionId}`);

  // 5. Parse CLI arguments (exclude node and script paths)
  const rawArgs = process.argv.slice(2);
  const { cwd, claudeArgs } = parseProxyArgs(rawArgs);
  logger.main(`CLI arguments: ${JSON.stringify(claudeArgs)}`);
  if (cwd) {
    logger.main(`Working directory: ${cwd}`);
  }

  // 6. Validate cwd if provided
  if (cwd && !fs.existsSync(cwd)) {
    console.error(`Error: working directory not found: ${cwd}`);
    process.exit(1);
  }

  // 7. Create PTY manager
  const ptyManager = new PTYManager(config.claudePath, config.retrySequenceDelayMs);

  // 8. Create SSE client
  const sseClient = new SSEClient(
    config.sseUrl,
    sessionId,
    config.initialRetryMs,
    config.maxRetryMs,
    config.retryMultiplier
  );

  // 9. Handle graceful shutdown
  const shutdown = (signal: string) => {
    logger.main(`${signal} received, shutting down`);
    sseClient.disconnect();
    ptyManager.kill();
    process.exit(0);
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  // 10. Spawn the PTY first
  try {
    ptyManager.spawn(claudeArgs, sessionId, cwd);
  } catch (error) {
    logger.error('Failed to spawn PTY:', error);
    console.error('Fatal error:', error);
    process.exit(1);
  }

  // 11. Display QR code and session info
  displaySessionQR(config.sseUrl, sessionId);

  // 12. Wire up PTY event handlers (must be after spawn)
  ptyManager.onExit((exitInfo) => {
    logger.main(`claude exited with code ${exitInfo.exitCode}`);
    sseClient.disconnect();
    process.exit(exitInfo.exitCode);
  });

  ptyManager.onData((data) => {
    process.stdout.write(data);
  });

  // 13. Setup stdin/stdout piping
  if (process.stdin.isTTY) {
    process.stdin.setRawMode(true);
    logger.main('Stdin set to raw mode');
  }

  process.stdin.on('data', (data) => {
    ptyManager.write(data.toString());
  });

  // 14. Handle terminal resize
  if (process.stdout.isTTY) {
    process.stdout.on('resize', () => {
      const cols = process.stdout.columns || 80;
      const rows = process.stdout.rows || 24;
      logger.pty(`Terminal resized to ${cols}x${rows}`);
      ptyManager.resize(cols, rows);
    });
  }

  // 15. Connect to SSE server (non-blocking)
  sseClient.onRetry(() => {
    logger.sse('Received retry event from server');
    ptyManager.sendRetrySequence();
  });

  sseClient.onOverride((prompt) => {
    logger.sse(`Received override event from server with prompt: "${prompt}"`);
    ptyManager.sendOverrideSequence(prompt);
  });

  sseClient.connect();
  logger.main('Proxy started successfully');
}

// Run the main function
main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
