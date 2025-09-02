/**
 * Simple logger utility that respects NODE_ENV
 * In production, only errors and warnings are logged
 * In development, all logs are shown
 */

const isDev = process.env.NODE_ENV !== 'production';
const isQuiet = process.env.QUIET === 'true';

export enum LogLevel {
  ERROR = 0,
  WARN = 1,
  INFO = 2,
  DEBUG = 3,
}

class Logger {
  private prefix: string;

  constructor(prefix: string = '') {
    this.prefix = prefix ? `[${prefix}] ` : '';
  }

  error(...args: any[]): void {
    if (!isQuiet) {
      console.error(this.prefix, ...args);
    }
  }

  warn(...args: any[]): void {
    if (!isQuiet) {
      console.warn(this.prefix, ...args);
    }
  }

  info(...args: any[]): void {
    if (isDev && !isQuiet) {
      console.log(this.prefix, ...args);
    }
  }

  debug(...args: any[]): void {
    if (isDev && !isQuiet && process.env.DEBUG) {
      console.log(this.prefix, '[DEBUG]', ...args);
    }
  }

  log(...args: any[]): void {
    // Alias for info
    this.info(...args);
  }
}

export function createLogger(prefix: string): Logger {
  return new Logger(prefix);
}

// Default logger instance
export const logger = new Logger('cctop');