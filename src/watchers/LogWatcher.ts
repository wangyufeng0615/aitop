import { EventEmitter } from 'events';
import * as fs from 'fs';
import { watch, FSWatcher } from 'chokidar';
import * as readline from 'readline';
import { isSafeToRead } from '../utils/pathSecurity';
import { createLogger } from '../utils/logger';

const logger = createLogger('LogWatcher');

export enum LogEventType {
  USER_INTERRUPT = 'user_interrupt',
  SESSION_START = 'session_start',
  SESSION_END = 'session_end',
  ERROR = 'error'
}

export interface LogEvent {
  type: LogEventType;
  sessionId: string;
  timestamp: Date;
  data?: any;
}

interface WatchedFile {
  watcher: FSWatcher;
  lastPosition: number;
}

/**
 * LogWatcher - A stateless log file watcher
 * 
 * Responsibilities:
 * - Watch log files for changes
 * - Detect specific events (like user interrupts)
 * - Emit events when detected
 * - No business logic or state management
 */
export class LogWatcher extends EventEmitter {
  private watchers = new Map<string, WatchedFile>();  // Only for tracking file positions
  
  /**
   * Start watching a log file
   * @param sessionId - The session ID
   * @param logPath - Path to the log file
   */
  async watchLogFile(sessionId: string, logPath: string): Promise<void> {
    // Skip if already watching
    if (this.watchers.has(sessionId)) {
      logger.debug(`Already watching log for session ${sessionId}`);
      return;
    }
    
    // Validate the file path
    if (!logPath || !isSafeToRead(logPath)) {
      logger.error(`Unsafe or invalid log path for session ${sessionId}: ${logPath}`);
      return;
    }
    
    // Check if file exists
    if (!fs.existsSync(logPath)) {
      logger.debug(`Log file not found for session ${sessionId}: ${logPath}`);
      // File might be created later, we could retry
      return;
    }
    
    logger.info(`Starting to watch log file for session ${sessionId}: ${logPath}`);
    
    // Get initial file position
    const stats = fs.statSync(logPath);
    const startPosition = stats.size;
    
    // Create file watcher
    const watcher = watch(logPath, {
      persistent: true,
      usePolling: true,
      interval: 100,
      awaitWriteFinish: {
        stabilityThreshold: 200,
        pollInterval: 100
      }
    });
    
    watcher.on('change', () => {
      const watchedFile = this.watchers.get(sessionId);
      if (watchedFile) {
        this.processNewLines(sessionId, logPath, watchedFile.lastPosition);
      }
    });
    
    this.watchers.set(sessionId, {
      watcher,
      lastPosition: startPosition
    });
    
    // Process existing content to check for existing interrupts
    this.processExistingContent(sessionId, logPath);
  }
  
  /**
   * Process existing log content
   */
  private async processExistingContent(sessionId: string, logPath: string): Promise<void> {
    try {
      const content = fs.readFileSync(logPath, 'utf-8');
      const lines = content.split('\n').filter(line => line.trim());
      
      // Check recent lines for interrupts
      for (let i = lines.length - 1; i >= Math.max(0, lines.length - 50); i--) {
        const line = lines[i];
        if (!line.trim()) continue;
        
        try {
          const entry = JSON.parse(line);
          
          if (this.isInterruptEntry(entry)) {
            this.emit('log', {
              type: LogEventType.USER_INTERRUPT,
              sessionId,
              timestamp: new Date(entry.timestamp || Date.now()),
              data: entry
            } as LogEvent);
            logger.info(`Detected existing interrupt in session ${sessionId}`);
            break;
          }
        } catch {
          // Ignore parse errors
        }
      }
    } catch (error) {
      logger.error(`Error processing existing content for ${sessionId}:`, error);
    }
  }
  
  /**
   * Process new lines in the log file
   */
  private async processNewLines(sessionId: string, logPath: string, fromPosition: number): Promise<void> {
    try {
      const stats = fs.statSync(logPath);
      const currentSize = stats.size;
      
      if (currentSize < fromPosition) {
        // File was truncated or rewritten
        fromPosition = 0;
      }
      
      if (currentSize === fromPosition) {
        // No new content
        return;
      }
      
      // Read new content
      const stream = fs.createReadStream(logPath, {
        start: fromPosition,
        end: currentSize
      });
      
      const rl = readline.createInterface({
        input: stream,
        crlfDelay: Infinity
      });
      
      for await (const line of rl) {
        if (!line.trim()) continue;
        
        try {
          const entry = JSON.parse(line);
          this.processLogEntry(sessionId, entry);
        } catch {
          // Ignore unparseable lines
        }
      }
      
      // Update position
      const watchedFile = this.watchers.get(sessionId);
      if (watchedFile) {
        watchedFile.lastPosition = currentSize;
      }
    } catch (error) {
      logger.error(`Error processing new lines for session ${sessionId}:`, error);
    }
  }
  
  /**
   * Process a single log entry
   */
  private processLogEntry(sessionId: string, entry: any): void {
    // Check for user interrupt
    if (this.isInterruptEntry(entry)) {
      this.emit('log', {
        type: LogEventType.USER_INTERRUPT,
        sessionId,
        timestamp: new Date(entry.timestamp || Date.now()),
        data: entry
      } as LogEvent);
      logger.info(`Detected user interrupt in session ${sessionId}`);
    }
    
    // Could add more event detection here
  }
  
  /**
   * Check if a log entry is a user interrupt
   */
  private isInterruptEntry(entry: any): boolean {
    if (entry.type !== 'user') return false;
    
    if (entry.message?.content) {
      // Check multiple formats
      if (typeof entry.message.content === 'string') {
        return entry.message.content.includes('[Request interrupted by user]');
      }
      if (Array.isArray(entry.message.content)) {
        return entry.message.content.some((item: any) => {
          return item?.text?.includes('[Request interrupted by user]') ||
                 (typeof item === 'string' && item.includes('[Request interrupted by user]'));
        });
      }
    }
    
    return false;
  }
  
  /**
   * Stop watching a specific session
   */
  stopWatching(sessionId: string): void {
    const watchedFile = this.watchers.get(sessionId);
    if (watchedFile) {
      watchedFile.watcher.close();
      this.watchers.delete(sessionId);
      logger.info(`Stopped watching session ${sessionId}`);
    }
  }
  
  /**
   * Stop all watchers
   */
  async stopAll(): Promise<void> {
    for (const [, watchedFile] of this.watchers) {
      await watchedFile.watcher.close();
    }
    this.watchers.clear();
    logger.info('All log watchers stopped');
  }
  
  /**
   * Get number of active watchers
   */
  getActiveCount(): number {
    return this.watchers.size;
  }
}