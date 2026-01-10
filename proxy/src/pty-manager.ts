import * as pty from 'node-pty';
import { logger } from './logger';

/**
 * Manages the PTY process for the claude CLI
 */
export class PTYManager {
  private pty: pty.IPty | null = null;
  private claudePath: string;

  constructor(claudePath: string) {
    this.claudePath = claudePath;
  }

  /**
   * Spawn the claude CLI in a PTY
   */
  spawn(args: string[], sessionId: string): void {
    const allArgs = [...args, '--session-id', sessionId];

    logger.pty(`Spawning claude: ${this.claudePath} ${allArgs.join(' ')}`);

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
        cwd: process.cwd(),
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
   */
  sendRetrySequence(): void {
    if (!this.pty) {
      logger.error('Cannot send retry sequence: PTY not initialized');
      return;
    }

    logger.pty('Sending retry sequence: ESC + retry + ENTER');
    this.pty.write('\x1bretry\r');
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
