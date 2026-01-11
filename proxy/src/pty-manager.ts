import * as pty from 'node-pty';
import { logger } from './logger';

/**
 * Manages the PTY process for the claude CLI
 */
export class PTYManager {
  private pty: pty.IPty | null = null;
  private claudePath: string;
  private retryDelayMs: number;

  constructor(claudePath: string, retryDelayMs: number) {
    this.claudePath = claudePath;
    this.retryDelayMs = retryDelayMs;
  }

  /**
   * Spawn the claude CLI in a PTY
   * @param args - CLI arguments to pass to claude
   * @param sessionId - Session ID for the claude session
   * @param cwd - Optional working directory (defaults to process.cwd())
   */
  spawn(args: string[], sessionId: string, cwd?: string): void {
    const allArgs = [...args, '--session-id', sessionId, '--model', 'sonnet'];
    const workingDir = cwd || process.cwd();

    logger.pty(`Spawning claude: ${this.claudePath} ${allArgs.join(' ')} (cwd: ${workingDir})`);

    // Filter out undefined environment variables
    const env: Record<string, string> = {};
    for (const [key, value] of Object.entries(process.env)) {
      if (value !== undefined) {
        env[key] = value;
      }
    }

    try {
      this.pty = pty.spawn(this.claudePath, allArgs, {
        name: 'xterm-256color',
        cols: process.stdout.columns || 80,
        rows: process.stdout.rows || 24,
        cwd: workingDir,
        env,
      });

      logger.pty('PTY spawned successfully');
    } catch (error) {
      logger.error('Failed to spawn PTY:', error);
      throw error;
    }
  }

  /**
   * Write data to the PTY
   */
  write(data: string): void {
    if (!this.pty) {
      logger.error('Cannot write: PTY not initialized');
      return;
    }
    this.pty.write(data);
  }

  /**
   * Send the retry sequence: ESC + "retry" + ENTER
   * This unblocks claude when waiting for user permission
   *
   * The sequence is split into two parts with a delay:
   * 1. Send ESC to cancel the permission menu
   * 2. Wait for the menu to be dismissed
   * 3. Send "retry" + ENTER to trigger the retry
   */
  sendRetrySequence(): void {
    if (!this.pty) {
      logger.error('Cannot send retry sequence: PTY not initialized');
      return;
    }

    logger.pty(`Sending retry sequence with ${this.retryDelayMs}ms delay`);

    // Step 1: Send ESC to cancel the menu
    logger.pty('Sending ESC to cancel permission menu');
    this.pty.write('\x1b');

    // Step 2: Wait for menu to be dismissed, then send retry command
    setTimeout(() => {
      if (!this.pty) {
        logger.error('PTY closed during retry sequence');
        return;
      }

      logger.pty('Sending retry command');
      this.pty.write('retry');
      this.pty.write('\x0d'); // Send ENTER as control character (CR)
    }, this.retryDelayMs);
  }

  /**
   * Send an override sequence: ESC + prompt + ENTER
   * This sends a custom prompt to claude after canceling the current menu
   */
  sendOverrideSequence(prompt: string): void {
    if (!this.pty) {
      logger.error('Cannot send override sequence: PTY not initialized');
      return;
    }

    logger.pty(`Sending override sequence with prompt: "${prompt}"`);

    // Step 1: Send ESC to cancel the menu
    logger.pty('Sending ESC to cancel current menu');
    this.pty.write('\x1b');

    // Step 2: Wait for menu to be dismissed, then send prompt + ENTER
    setTimeout(() => {
      if (!this.pty) {
        logger.error('PTY closed during override sequence');
        return;
      }

      logger.pty('Sending override prompt:', prompt);
      this.pty.write(prompt);
      setTimeout(() => {
        if (!this.pty) {
          logger.error('PTY closed during override sequence');
          return;
        }

        logger.pty('Sending ENTER');
        this.pty.write('\x0d'); // Send ENTER as control character (CR)
      }, this.retryDelayMs);
    }, this.retryDelayMs);
  }

  /**
   * Register a callback for PTY data output
   */
  onData(callback: (data: string) => void): void {
    if (!this.pty) {
      logger.error('Cannot register data callback: PTY not initialized');
      return;
    }
    this.pty.onData(callback);
  }

  /**
   * Register a callback for PTY exit
   */
  onExit(callback: (exitCode: { exitCode: number; signal?: number }) => void): void {
    if (!this.pty) {
      logger.error('Cannot register exit callback: PTY not initialized');
      return;
    }
    this.pty.onExit(callback);
  }

  /**
   * Resize the PTY
   */
  resize(cols: number, rows: number): void {
    if (!this.pty) {
      logger.error('Cannot resize: PTY not initialized');
      return;
    }
    logger.pty(`Resizing PTY to ${cols}x${rows}`);
    this.pty.resize(cols, rows);
  }

  /**
   * Kill the PTY process
   */
  kill(): void {
    if (!this.pty) {
      logger.pty('PTY already killed or not initialized');
      return;
    }
    logger.pty('Killing PTY');
    this.pty.kill();
    this.pty = null;
  }
}
