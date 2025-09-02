import { createLogger } from '../utils/logger';
import { getProcessList } from '../utils/commandSecurity';

const logger = createLogger('ProcessScanner');

export interface ProcessInfo {
  pid: number;
  cpuUsage: number;
  memoryUsage: number;
  runningTime: string;
  startTime: Date;
}

/**
 * ProcessScanner - A stateless utility for scanning system processes
 * 
 * This is a pure function module with no internal state.
 * It only scans and returns current process information.
 */

/**
 * Scan for Claude processes
 * @returns Array of process information
 */
export async function scanClaudeProcesses(): Promise<ProcessInfo[]> {
  try {
    // Get all claude processes safely
    const lines = await getProcessList('claude');
    logger.debug(`Found ${lines.length} claude processes`);
    
    const processes: ProcessInfo[] = [];
    
    for (const line of lines) {
      const parts = line.split(/\s+/);
      if (parts.length < 11) continue;
      
      const pid = parseInt(parts[1]);
      const cpuUsage = parseFloat(parts[2]);
      const memoryUsage = parseFloat(parts[3]);
      const etime = parts[9];
      
      if (isNaN(pid)) continue;
      
      // Calculate real start time from elapsed time
      const startTime = calculateStartTime(etime);
      
      processes.push({
        pid,
        cpuUsage,
        memoryUsage,
        runningTime: etime,
        startTime
      });
    }
    
    return processes;
  } catch (error) {
    // No processes found (grep returns error code 1)
    if ((error as any).code === 1) {
      return [];
    }
    logger.error('Error scanning processes:', error);
    return [];
  }
}

/**
 * Parse elapsed time string and calculate actual start time
 * @param etime - Elapsed time string from ps command
 * @returns Calculated start time
 */
function calculateStartTime(etime: string): Date {
  const now = new Date();
  let totalSeconds = 0;
  
  // Handle different time formats
  if (etime.includes('-')) {
    // Format: D-HH:MM:SS or DD-HH:MM:SS
    const [days, time] = etime.split('-');
    totalSeconds += parseInt(days) * 86400;
    const timeParts = time.split(':');
    if (timeParts.length === 3) {
      totalSeconds += parseInt(timeParts[0]) * 3600 + parseInt(timeParts[1]) * 60 + parseFloat(timeParts[2]);
    } else if (timeParts.length === 2) {
      totalSeconds += parseInt(timeParts[0]) * 60 + parseFloat(timeParts[1]);
    }
  } else {
    const timeParts = etime.split(':');
    if (timeParts.length === 1) {
      // Format: SS
      totalSeconds = parseFloat(timeParts[0]);
    } else if (timeParts.length === 2) {
      // Format: MM:SS or MM:SS.ms
      totalSeconds = parseInt(timeParts[0]) * 60 + parseFloat(timeParts[1]);
    } else if (timeParts.length === 3) {
      // Format: HH:MM:SS
      totalSeconds = parseInt(timeParts[0]) * 3600 + parseInt(timeParts[1]) * 60 + parseFloat(timeParts[2]);
    }
  }
  
  return new Date(now.getTime() - totalSeconds * 1000);
}