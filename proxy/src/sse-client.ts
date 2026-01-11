import EventSource from 'eventsource';
import { logger } from './logger';

/**
 * Manages reconnection logic with exponential backoff
 */
class ReconnectionManager {
  private currentRetryMs: number;
  private retryTimer: NodeJS.Timeout | null = null;

  constructor(
    private initialRetryMs: number,
    private maxRetryMs: number,
    private retryMultiplier: number
  ) {
    this.currentRetryMs = initialRetryMs;
  }

  /**
   * Schedule a retry with exponential backoff
   */
  scheduleRetry(connectFn: () => void): void {
    if (this.retryTimer) {
      clearTimeout(this.retryTimer);
    }

    logger.sse(`Scheduling retry in ${this.currentRetryMs}ms`);

    this.retryTimer = setTimeout(() => {
      connectFn();
      // Increase retry interval for next time
      this.currentRetryMs = Math.min(
        this.currentRetryMs * this.retryMultiplier,
        this.maxRetryMs
      );
    }, this.currentRetryMs);
  }

  /**
   * Reset backoff to initial value (on successful connection)
   */
  resetBackoff(): void {
    this.currentRetryMs = this.initialRetryMs;
    if (this.retryTimer) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }
  }

  /**
   * Cancel any pending retry
   */
  cancel(): void {
    if (this.retryTimer) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }
  }
}

/**
 * SSE client that connects to the server and handles events
 */
export class SSEClient {
  private eventSource: EventSource | null = null;
  private reconnectionManager: ReconnectionManager;
  private retryCallback: (() => void) | null = null;
  private overrideCallback: ((prompt: string) => void) | null = null;
  private baseUrl: string;
  private sessionId: string;

  constructor(
    baseUrl: string,
    sessionId: string,
    initialRetryMs: number,
    maxRetryMs: number,
    retryMultiplier: number
  ) {
    this.baseUrl = baseUrl;
    this.sessionId = sessionId;
    this.reconnectionManager = new ReconnectionManager(
      initialRetryMs,
      maxRetryMs,
      retryMultiplier
    );
  }

  /**
   * Connect to the SSE endpoint
   */
  connect(): void {
    const url = `${this.baseUrl}/api/events?sessionId=${this.sessionId}`;
    logger.sse(`Connecting to SSE: ${url}`);

    try {
      this.eventSource = new EventSource(url);

      this.eventSource.onopen = () => {
        logger.sse('SSE connection established');
        this.reconnectionManager.resetBackoff();
      };

      this.eventSource.addEventListener('retry', (event) => {
        logger.sse('Received retry event');
        if (this.retryCallback) {
          this.retryCallback();
        }
      });

      this.eventSource.addEventListener('override', (event: MessageEvent) => {
        logger.sse('Received override event with prompt:', JSON.stringify(event.data));
        if (this.overrideCallback && event.data) {
          this.overrideCallback(event.data);
        }
      });

      this.eventSource.onerror = (error) => {
        logger.sse('SSE connection error:', error);

        // Close the current connection
        if (this.eventSource) {
          this.eventSource.close();
          this.eventSource = null;
        }

        // Schedule reconnection
        this.reconnectionManager.scheduleRetry(() => {
          this.connect();
        });
      };
    } catch (error) {
      logger.error('Failed to create EventSource:', error);
      // Schedule reconnection on error
      this.reconnectionManager.scheduleRetry(() => {
        this.connect();
      });
    }
  }

  /**
   * Register a callback for retry events
   */
  onRetry(callback: () => void): void {
    this.retryCallback = callback;
  }

  /**
   * Register a callback for override events
   */
  onOverride(callback: (prompt: string) => void): void {
    this.overrideCallback = callback;
  }

  /**
   * Disconnect from the SSE endpoint
   */
  disconnect(): void {
    logger.sse('Disconnecting from SSE');
    this.reconnectionManager.cancel();
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }
  }
}
