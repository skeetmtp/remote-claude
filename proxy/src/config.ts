import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';
import { Config } from './types';

/**
 * Load configuration from environment variables with defaults
 */
export function loadConfig(): Config {
  const claudePath = path.join(os.homedir(), '.local', 'bin', 'claude');
  const sseUrl = process.env.PROXY_SERVER_URL || 'http://localhost:3000';

  return {
    claudePath,
    sseUrl,
    initialRetryMs: 1000,
    maxRetryMs: 30000,
    retryMultiplier: 2.0,
    retrySequenceDelayMs: parseInt(process.env.RETRY_SEQUENCE_DELAY_MS || '100', 10),
  };
}
