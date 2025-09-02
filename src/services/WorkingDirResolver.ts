/**
 * WorkingDirResolver - 专门负责解析进程工作目录
 * 
 * 单一职责：获取和缓存进程的工作目录
 * 使用缓存避免频繁的 lsof 调用
 */

import { spawn } from 'child_process';
import * as fs from 'fs';
import { createLogger } from '../utils/logger';

const logger = createLogger('WorkingDirResolver');

interface DirCache {
  dir: string | null;
  timestamp: number;
}

export class WorkingDirResolver {
  private cache = new Map<number, DirCache>();
  private readonly CACHE_TTL = 30000; // 30 seconds cache
  private resolving = new Set<number>(); // Prevent concurrent resolutions
  
  /**
   * Get working directory for a process
   * Returns cached value if available and fresh
   */
  async getWorkingDir(pid: number): Promise<string | null> {
    // Check cache first
    const cached = this.cache.get(pid);
    if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
      return cached.dir;
    }
    
    // Avoid concurrent resolutions for the same PID
    if (this.resolving.has(pid)) {
      return cached?.dir || null;
    }
    
    this.resolving.add(pid);
    
    try {
      const dir = await this.resolveWorkingDir(pid);
      
      // Update cache
      this.cache.set(pid, {
        dir,
        timestamp: Date.now()
      });
      
      return dir;
    } catch (error) {
      logger.debug(`Failed to get working dir for PID ${pid}: ${error}`);
      return cached?.dir || null;
    } finally {
      this.resolving.delete(pid);
    }
  }
  
  /**
   * Batch get working directories for multiple PIDs
   * More efficient than individual calls
   */
  async getWorkingDirs(pids: number[]): Promise<Map<number, string | null>> {
    const results = new Map<number, string | null>();
    const toResolve: number[] = [];
    
    // Check cache first
    for (const pid of pids) {
      const cached = this.cache.get(pid);
      if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
        results.set(pid, cached.dir);
      } else if (!this.resolving.has(pid)) {
        toResolve.push(pid);
      } else {
        results.set(pid, cached?.dir || null);
      }
    }
    
    // Resolve uncached PIDs
    if (toResolve.length > 0) {
      const resolved = await Promise.allSettled(
        toResolve.map(pid => this.getWorkingDir(pid))
      );
      
      toResolve.forEach((pid, index) => {
        const result = resolved[index];
        if (result.status === 'fulfilled') {
          results.set(pid, result.value);
        } else {
          results.set(pid, null);
        }
      });
    }
    
    return results;
  }
  
  /**
   * Actually resolve the working directory using lsof
   */
  private resolveWorkingDir(pid: number): Promise<string | null> {
    const platform = process.platform;
    if (platform === 'linux') {
      return this.resolveWorkingDirLinux(pid);
    }
    if (platform === 'darwin') {
      return this.resolveWorkingDirDarwin(pid);
    }
    // Unsupported platforms: return null without guessing
    return Promise.resolve(null);
  }

  /**
   * Resolve cwd on Linux via /proc/<pid>/cwd symlink
   */
  private async resolveWorkingDirLinux(pid: number): Promise<string | null> {
    const linkPath = `/proc/${pid}/cwd`;
    try {
      const dir = await fs.promises.readlink(linkPath);
      return dir || null;
    } catch {
      return null;
    }
  }

  /**
   * Resolve cwd on macOS using lsof filtered to cwd fd
   */
  private resolveWorkingDirDarwin(pid: number): Promise<string | null> {
    return new Promise((resolve) => {
      // Only ask for cwd descriptor to avoid scanning all FDs
      const child = spawn('lsof', ['-a', '-p', pid.toString(), '-d', 'cwd', '-Fn']);

      let output = '';

      child.stdout.on('data', (data) => {
        output += data.toString();
      });

      const onFinish = () => {
        const lines = output.split('\n');
        for (const line of lines) {
          if (line.startsWith('n')) {
            const dir = line.substring(1).trim();
            resolve(dir || null);
            return;
          }
        }
        resolve(null);
      };

      child.on('close', onFinish);
      child.on('error', () => resolve(null));

      // Safety timeout
      const timeout = setTimeout(() => {
        try { child.kill(); } catch {}
        resolve(null);
      }, 2000);

      child.on('exit', () => clearTimeout(timeout));
    });
  }
  
  /**
   * Clear cache for a specific PID or all
   */
  clearCache(pid?: number): void {
    if (pid !== undefined) {
      this.cache.delete(pid);
    } else {
      this.cache.clear();
    }
  }
  
  /**
   * Clean up old cache entries
   */
  cleanupCache(): void {
    const now = Date.now();
    for (const [pid, entry] of this.cache.entries()) {
      if (now - entry.timestamp > this.CACHE_TTL * 2) {
        this.cache.delete(pid);
      }
    }
  }
}
