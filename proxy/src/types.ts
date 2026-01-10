/**
 * Configuration interface for the proxy
 */
export interface Config {
  /** Path to the claude CLI binary */
  claudePath: string;

  /** SSE server URL for receiving events */
  sseUrl: string;

  /** Initial retry interval in milliseconds */
  initialRetryMs: number;

  /** Maximum retry interval in milliseconds */
  maxRetryMs: number;

  /** Retry interval multiplier for exponential backoff */
  retryMultiplier: number;
}

/**
 * PTY spawn options
 */
export interface PTYOptions {
  /** Terminal name */
  name: string;

  /** Terminal columns */
  cols: number;

  /** Terminal rows */
  rows: number;

  /** Current working directory */
  cwd: string;

  /** Environment variables */
  env: NodeJS.ProcessEnv;
}

/**
 * SSE event types
 */
export enum SSEEventType {
  RETRY = 'retry',
}

/**
 * SSE event interface
 */
export interface SSEEvent {
  type: SSEEventType;
  data?: string;
}
