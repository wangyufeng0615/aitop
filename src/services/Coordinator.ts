import { EventEmitter } from 'events';
import { SessionStore } from './SessionStore';
import { scanClaudeProcesses } from './ProcessScanner';
import { WorkingDirResolver } from './WorkingDirResolver';
import { HookWatcher, HookEvent, HookEventType } from '../watchers/HookWatcher';
import { LogWatcher, LogEvent, LogEventType } from '../watchers/LogWatcher';
import { ProcessStatus } from '../types/common';
import { ClaudeProcess } from '../types/shared';
import { createLogger } from '../utils/logger';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';

const logger = createLogger('Coordinator');

/**
 * Coordinator - The orchestration layer
 * 
 * Responsibilities:
 * - Connect all components together
 * - Handle business logic
 * - Coordinate state updates
 * - Manage component lifecycle
 */
export class Coordinator extends EventEmitter {
  private store: SessionStore;
  private hookWatcher: HookWatcher;
  private logWatcher: LogWatcher;
  private workingDirResolver: WorkingDirResolver;
  private scanTimer: NodeJS.Timeout | null = null;
  private dirUpdateTimer: NodeJS.Timeout | null = null;
  
  constructor() {
    super();
    this.store = new SessionStore();
    this.hookWatcher = new HookWatcher();
    this.logWatcher = new LogWatcher();
    this.workingDirResolver = new WorkingDirResolver();
    
    this.setupEventHandlers();
  }
  
  /**
   * Set up event handlers for all components
   */
  private setupEventHandlers(): void {
    // HTTP hooks are received via Coordinator.receiveHook from the HTTP endpoint
    
    // Handle log events
    this.logWatcher.on('log', (event: LogEvent) => {
      this.handleLogEvent(event);
    });
    
    // Forward store events
    this.store.on('state:changed', (processes: ClaudeProcess[]) => {
      this.emit('update', processes);
    });
    
    this.store.on('process:updated', (process) => {
      this.emit('session:updated', process);
    });
    
    this.store.on('process:removed', (data) => {
      this.emit('session:removed', data);
      // Stop watching logs for removed session
      this.logWatcher.stopWatching(data.sessionId);
    });
  }
  
  /**
   * Handle hook events
   */
  private handleHookEvent(event: HookEvent): void {
    logger.info(`Processing ${event.type} for session ${event.sessionId}`);
    
    // Find process by sessionId or create new one
    let process = this.store.getProcessBySessionId(event.sessionId);
    let pid = event.pid || process?.pid;
    
    // If no PID yet, try to find it from running processes
    if (!pid) {
      const processes = this.store.getAllProcesses();
      // Find a process without a real sessionId (using generated ID)
      for (const p of processes) {
        if (p.sessionId?.startsWith('pid-')) {
          pid = p.pid;
          logger.info(`Associated session ${event.sessionId} with PID ${pid}`);
          break;
        }
      }
    }
    
    if (!pid) {
      // Create a placeholder PID
      pid = Date.now(); // Temporary PID until we find the real one
      logger.warn(`No PID found for session ${event.sessionId}, using placeholder`);
    }
    
    // Determine status based on event type
    let status: ProcessStatus;
    switch (event.type) {
      case HookEventType.SESSION_START:
        status = ProcessStatus.IDLE;
        break;
      case HookEventType.REQUEST_START:
        status = ProcessStatus.RUNNING;
        break;
      case HookEventType.REQUEST_STOP:
        status = ProcessStatus.IDLE;
        break;
      default:
        status = ProcessStatus.IDLE;
    }
    
    // Update or create process
    this.store.upsertProcess(pid, {
      sessionId: event.sessionId,
      status,
      displayName: `Session ${event.sessionId.substring(0, 8)}`
    });
    
    // Associate session with PID if needed
    if (event.pid && event.pid !== pid) {
      this.store.associateSession(event.pid, event.sessionId, event.transcriptPath);
    }
    
    // Start watching logs if we have transcript path
    if (event.transcriptPath) {
      this.startWatchingLogs(event.sessionId, event.transcriptPath);
    }
  }

  /**
   * Public receiver for external hook sources (e.g., HTTP)
   */
  public receiveHook(event: HookEvent): void {
    this.handleHookEvent(event);
  }
  
  /**
   * Handle log events
   */
  private handleLogEvent(event: LogEvent): void {
    if (event.type === LogEventType.USER_INTERRUPT) {
      logger.info(`User interrupt detected for session ${event.sessionId}`);
      this.store.updateStatusBySessionId(event.sessionId, ProcessStatus.IDLE);
    }
  }
  
  /**
   * Start watching logs for a session
   */
  private startWatchingLogs(sessionId: string, transcriptPath?: string): void {
    let logPath: string | undefined;
    
    if (transcriptPath && fs.existsSync(transcriptPath)) {
      // Use the provided transcript path
      logPath = transcriptPath;
    } else {
      // Try to find the log file
      logPath = this.findLogFile(sessionId);
    }
    
    if (logPath) {
      this.logWatcher.watchLogFile(sessionId, logPath);
    } else {
      // Retry later
      setTimeout(() => {
        const path = this.findLogFile(sessionId);
        if (path) {
          this.logWatcher.watchLogFile(sessionId, path);
        }
      }, 2000);
    }
  }
  
  /**
   * Find log file for a session
   */
  private findLogFile(sessionId: string): string | undefined {
    const logDir = path.join(os.homedir(), '.claude', 'projects');
    
    if (!fs.existsSync(logDir)) {
      return undefined;
    }
    
    try {
      const projectDirs = fs.readdirSync(logDir);
      for (const projectDir of projectDirs) {
        const projectPath = path.join(logDir, projectDir);
        if (!fs.statSync(projectPath).isDirectory()) continue;
        
        const logFile = path.join(projectPath, `${sessionId}.jsonl`);
        if (fs.existsSync(logFile)) {
          return logFile;
        }
      }
    } catch (error) {
      logger.error(`Error searching for log file: ${error}`);
    }
    
    return undefined;
  }
  
  /**
   * Scan processes and update metrics
   */
  private async scanProcesses(): Promise<void> {
    try {
      const processes = await scanClaudeProcesses();
      
      // Update metrics for known processes
      for (const processInfo of processes) {
        const existingProcess = this.store.getProcess(processInfo.pid);
        
        if (existingProcess) {
          // Update metrics for existing process
          this.store.updateMetrics(processInfo.pid, {
            cpuUsage: processInfo.cpuUsage,
            memoryUsage: processInfo.memoryUsage,
            runningTime: processInfo.runningTime
          });
        } else {
          // New process discovered
          this.store.upsertProcess(processInfo.pid, {
            cpuUsage: processInfo.cpuUsage,
            memoryUsage: processInfo.memoryUsage,
            runningTime: processInfo.runningTime,
            startTime: processInfo.startTime,
            firstSeenAt: processInfo.startTime
          });
        }
      }
      
      // Check for dead processes (those not in current scan)
      const currentPids = new Set(processes.map(p => p.pid));
      const trackedProcesses = this.store.getAllProcesses();
      
      for (const tracked of trackedProcesses) {
        if (!currentPids.has(tracked.pid) && tracked.pid < 1000000) {
          // Process is gone (exclude placeholder PIDs > 1000000)
          this.store.removeProcess(tracked.pid);
        }
      }
    } catch (error) {
      logger.error('Error scanning processes:', error);
    }
  }
  
  /**
   * Update working directories for active processes
   * This runs less frequently to avoid performance impact
   */
  private async updateWorkingDirs(): Promise<void> {
    try {
      const processes = this.store.getAllProcesses();
      const pids = processes.map(p => p.pid).filter(pid => pid < 1000000); // Real PIDs only
      
      if (pids.length === 0) return;
      
      const dirs = await this.workingDirResolver.getWorkingDirs(pids);
      
      for (const [pid, dir] of dirs.entries()) {
        if (dir) {
          this.store.updateProcess(pid, { workingDir: dir });
        }
      }
      
      // Cleanup old cache entries
      this.workingDirResolver.cleanupCache();
    } catch (error) {
      logger.error('Error updating working directories:', error);
    }
  }
  
  /**
   * Start the coordinator
   */
  async start(): Promise<void> {
    logger.info('Starting coordinator...');
    
    // Start components
    await this.hookWatcher.start();
    this.store.startLivenessCheck();
    
    // Start process scanning
    const scan = async () => {
      await this.scanProcesses();
      this.scanTimer = setTimeout(scan, 1000);
    };
    await scan();
    
    // Start working directory updates (less frequent - every 5 seconds)
    const updateDirs = async () => {
      await this.updateWorkingDirs();
      this.dirUpdateTimer = setTimeout(updateDirs, 5000);
    };
    // Initial delay to let processes stabilize
    this.dirUpdateTimer = setTimeout(updateDirs, 2000);
    
    logger.info('Coordinator started');
  }
  
  /**
   * Stop the coordinator
   */
  stop(): void {
    logger.info('Stopping coordinator...');
    
    if (this.scanTimer) {
      clearTimeout(this.scanTimer);
      this.scanTimer = null;
    }
    
    if (this.dirUpdateTimer) {
      clearTimeout(this.dirUpdateTimer);
      this.dirUpdateTimer = null;
    }
    
    this.hookWatcher.stop();
    this.logWatcher.stopAll();
    this.store.stopLivenessCheck();
    
    logger.info('Coordinator stopped');
  }
  
  /**
   * Get all processes
   */
  getAllProcesses(): ClaudeProcess[] {
    return this.store.getAllProcesses();
  }
  
  /**
   * Get statistics
   */
  getStats() {
    return this.store.getStats();
  }
}
