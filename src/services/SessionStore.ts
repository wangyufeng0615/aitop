import { EventEmitter } from 'events';
import { ProcessStatus } from '../types/common';
import { ClaudeProcess } from '../types/shared';
import { createLogger } from '../utils/logger';
import { isProcessRunning, validatePID } from '../utils/commandSecurity';

const logger = createLogger('SessionStore');

/**
 * SessionStore - The single source of truth for all process/session state
 * 
 * A Claude process IS a session, no need to separate them.
 * Every process should have a sessionId (either real or generated).
 */
export class SessionStore extends EventEmitter {
  // Single map for all tracked processes
  private processes = new Map<number, ClaudeProcess>();
  private pidCheckInterval: NodeJS.Timeout | null = null;
  
  /**
   * Start periodic PID liveness checks
   */
  startLivenessCheck(intervalMs: number = 1000): void {
    this.stopLivenessCheck();
    
    this.pidCheckInterval = setInterval(async () => {
      await this.checkDeadProcesses();
    }, intervalMs);
    
    logger.info('Started liveness checking');
  }
  
  /**
   * Stop periodic PID liveness checks
   */
  stopLivenessCheck(): void {
    if (this.pidCheckInterval) {
      clearInterval(this.pidCheckInterval);
      this.pidCheckInterval = null;
    }
  }
  
  /**
   * Update or create a process/session
   */
  upsertProcess(pid: number, updates: Partial<ClaudeProcess>): void {
    const existing = this.processes.get(pid);
    
    const process: ClaudeProcess = existing ? {
      ...existing,
      ...updates,
      lastActiveTime: new Date()
    } : {
      pid,
      sessionId: updates.sessionId || `pid-${pid}`,
      status: ProcessStatus.IDLE,
      cpuUsage: 0,
      memoryUsage: 0,
      startTime: new Date(),
      lastActiveTime: new Date(),
      runningTime: '0:00',
      firstSeenAt: new Date(),
      ...updates
    };
    
    // Ensure displayName
    if (!process.displayName) {
      process.displayName = process.sessionId ? 
        `Session ${process.sessionId.substring(0, 8)}` : 
        `PID ${pid}`;
    }
    
    this.processes.set(pid, process);
    this.emit('process:updated', process);
    this.emit('state:changed', this.getAllProcesses());
  }
  
  /**
   * Update process status by sessionId
   */
  updateStatusBySessionId(sessionId: string, status: ProcessStatus): void {
    for (const process of this.processes.values()) {
      if (process.sessionId === sessionId) {
        if (process.status !== status) {
          process.status = status;
          process.lastActiveTime = new Date();
          this.emit('process:updated', process);
          this.emit('state:changed', this.getAllProcesses());
        }
        break;
      }
    }
  }
  
  /**
   * Associate a sessionId with a PID
   */
  associateSession(pid: number, sessionId: string, transcriptPath?: string): void {
    const process = this.processes.get(pid);
    if (process) {
      process.sessionId = sessionId;
      process.displayName = `Session ${sessionId.substring(0, 8)}`;
      if (transcriptPath) {
        // Store transcript path in process object for log watching
        (process as any).transcriptPath = transcriptPath;
      }
      this.emit('process:updated', process);
      this.emit('state:changed', this.getAllProcesses());
    } else {
      // Create new process entry
      this.upsertProcess(pid, { 
        sessionId, 
        displayName: `Session ${sessionId.substring(0, 8)}`
      });
    }
  }
  
  /**
   * Get process by PID
   */
  getProcess(pid: number): ClaudeProcess | undefined {
    return this.processes.get(pid);
  }
  
  /**
   * Get process by sessionId
   */
  getProcessBySessionId(sessionId: string): ClaudeProcess | undefined {
    for (const process of this.processes.values()) {
      if (process.sessionId === sessionId) {
        return process;
      }
    }
    return undefined;
  }
  
  /**
   * Check if a process exists
   */
  hasProcess(pid: number): boolean {
    return this.processes.has(pid);
  }
  
  /**
   * Check if a session exists
   */
  hasSession(sessionId: string): boolean {
    for (const process of this.processes.values()) {
      if (process.sessionId === sessionId) {
        return true;
      }
    }
    return false;
  }
  
  /**
   * Remove a process
   */
  removeProcess(pid: number): void {
    const process = this.processes.get(pid);
    if (!process) return;
    
    this.processes.delete(pid);
    this.emit('process:removed', { pid, sessionId: process.sessionId });
    this.emit('state:changed', this.getAllProcesses());
  }
  
  /**
   * Check and clean up dead processes
   */
  private async checkDeadProcesses(): Promise<void> {
    const pids = Array.from(this.processes.keys());
    if (pids.length === 0) return;
    
    const deadPids: number[] = [];
    
    for (const pid of pids) {
      try {
        const validPid = validatePID(pid);
        const isAlive = await isProcessRunning(validPid);
        if (!isAlive) {
          deadPids.push(pid);
        }
      } catch {
        deadPids.push(pid);
      }
    }
    
    // Remove dead processes
    for (const pid of deadPids) {
      const process = this.processes.get(pid);
      if (process) {
        logger.info(`Removing dead process ${pid} (session: ${process.sessionId})`);
        this.removeProcess(pid);
      }
    }
  }
  
  /**
   * Update process metrics (CPU, memory, etc.)
   */
  updateMetrics(pid: number, metrics: { 
    cpuUsage?: number; 
    memoryUsage?: number; 
    runningTime?: string;
  }): void {
    const process = this.processes.get(pid);
    if (process) {
      let changed = false;
      
      if (metrics.cpuUsage !== undefined && process.cpuUsage !== metrics.cpuUsage) {
        process.cpuUsage = metrics.cpuUsage;
        changed = true;
      }
      
      if (metrics.memoryUsage !== undefined && process.memoryUsage !== metrics.memoryUsage) {
        process.memoryUsage = metrics.memoryUsage;
        changed = true;
      }
      
      if (metrics.runningTime !== undefined && process.runningTime !== metrics.runningTime) {
        process.runningTime = metrics.runningTime;
        changed = true;
      }
      
      if (changed) {
        this.emit('metrics:updated', { pid, ...metrics });
        this.emit('state:changed', this.getAllProcesses());
      }
    }
  }
  
  /**
   * Get all processes
   */
  getAllProcesses(): ClaudeProcess[] {
    return Array.from(this.processes.values());
  }
  
  /**
   * Clear all processes
   */
  clear(): void {
    this.processes.clear();
    this.emit('state:changed', []);
  }
  
  /**
   * Update process with partial data (generic update method)
   */
  updateProcess(pid: number, updates: Partial<ClaudeProcess>): void {
    const process = this.processes.get(pid);
    if (!process) return;
    
    Object.assign(process, updates);
    this.emit('process:updated', process);
    this.emit('state:changed', this.getAllProcesses());
  }
  
  /**
   * Get statistics
   */
  getStats(): { 
    totalProcesses: number; 
    activeProcesses: number; 
  } {
    const activeProcesses = Array.from(this.processes.values())
      .filter(p => p.status === ProcessStatus.RUNNING).length;
    
    return {
      totalProcesses: this.processes.size,
      activeProcesses
    };
  }
}