import debug from 'debug';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Setup logging infrastructure
 * If DEBUG env var is set, logs will be written to a file
 */
export function setupLogging(): void {
  if (process.env.DEBUG) {
    const logDir = path.join(__dirname, '..', 'logs');
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const logFile = path.join(logDir, `proxy-${timestamp}.log`);
    const logStream = fs.createWriteStream(logFile, { flags: 'a' });

    // Redirect debug output to file
    debug.log = (msg: string) => {
      logStream.write(msg + '\n');
    };
  }
}

/**
 * Create namespaced loggers
 */
export const logger = {
  main: debug('proxy:main'),
  pty: debug('proxy:pty'),
  sse: debug('proxy:sse'),
  error: debug('proxy:error'),
};
