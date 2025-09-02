/**
 * Secure command execution utilities to prevent command injection
 */

import { spawn, SpawnOptionsWithoutStdio } from 'child_process';
import { createLogger } from './logger';

const logger = createLogger('CommandSecurity');

export interface CommandResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

/**
 * Validates that a PID is safe to use in commands
 * @param pid The process ID to validate
 * @throws Error if PID is invalid
 */
export function validatePID(pid: number | string): number {
  const numPid = typeof pid === 'string' ? parseInt(pid, 10) : pid;
  
  if (!Number.isInteger(numPid) || numPid <= 0 || numPid > 2147483647) {
    logger.error(`Invalid PID attempted: ${pid}`);
    throw new Error('Invalid process ID');
  }
  
  return numPid;
}

/**
 * Executes a command safely using spawn instead of exec
 * This prevents shell injection attacks
 * @param command The command to execute
 * @param args Array of arguments
 * @param options Spawn options
 * @returns Promise with command result
 */
export function safeExec(
  command: string,
  args: string[] = [],
  options?: SpawnOptionsWithoutStdio
): Promise<CommandResult> {
  return new Promise((resolve, reject) => {
    // Validate command is not empty
    if (!command || command.trim().length === 0) {
      reject(new Error('Command cannot be empty'));
      return;
    }
    
    // Log the command being executed (in debug mode)
    logger.debug(`Executing: ${command} ${args.join(' ')}`);
    
    const child = spawn(command, args, {
      ...options,
      shell: false, // Never use shell to prevent injection
    });
    
    let stdout = '';
    let stderr = '';
    
    child.stdout?.on('data', (data) => {
      stdout += data.toString();
    });
    
    child.stderr?.on('data', (data) => {
      stderr += data.toString();
    });
    
    child.on('error', (error) => {
      logger.error(`Command execution error: ${error.message}`);
      reject(error);
    });
    
    child.on('close', (code) => {
      resolve({
        stdout,
        stderr,
        exitCode: code || 0,
      });
    });
  });
}

/**
 * Gets process information safely using ps command
 * @returns Promise with array of process info
 */
export async function getProcessList(processName: string = 'claude'): Promise<string[]> {
  // Use ps with specific format to avoid parsing issues
  const result = await safeExec('ps', [
    'aux'
  ]);
  
  if (result.exitCode !== 0) {
    logger.error(`ps command failed: ${result.stderr}`);
    return [];
  }
  
  // Filter for the process name
  const lines = result.stdout
    .split('\n')
    .filter(line => line.includes(processName) && !line.includes('grep'));
  
  return lines;
}

/**
 * Checks if a process is running
 * @param pid The process ID
 * @returns Promise with boolean result
 */
export async function isProcessRunning(pid: number): Promise<boolean> {
  const validPid = validatePID(pid);
  
  try {
    // Use kill -0 to check if process exists (doesn't actually kill)
    const result = await safeExec('kill', ['-0', validPid.toString()]);
    return result.exitCode === 0;
  } catch {
    return false;
  }
}

