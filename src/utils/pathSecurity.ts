/**
 * Path security utilities
 */

import path from 'path';
import fs from 'fs';
import { createLogger } from './logger';

const logger = createLogger('PathSecurity');

/**
 * Validates that a file path is safe to read
 * @param filePath The file path to validate
 * @returns true if the file is safe to read
 */
export function isSafeToRead(filePath: string): boolean {
  try {
    // Get the real path (follows symlinks)
    const realPath = fs.realpathSync(filePath);
    
    // Check if it's in a safe directory
    const safeDirs = [
      path.join(process.env.HOME || '', '.claude'),
    ];
    
    // Must be in one of the safe directories
    const isInSafeDir = safeDirs.some(dir => realPath.startsWith(path.resolve(dir)));
    
    if (!isInSafeDir) {
      logger.warn(`Attempted to read file outside safe directories: ${filePath}`);
      return false;
    }
    
    // Check file permissions
    const stats = fs.statSync(realPath);
    
    // Should not be a symbolic link (we already resolved it)
    if (stats.isSymbolicLink()) {
      logger.warn(`Symbolic link detected: ${filePath}`);
      return false;
    }
    
    // Should be a regular file
    if (!stats.isFile()) {
      logger.warn(`Not a regular file: ${filePath}`);
      return false;
    }
    
    return true;
  } catch (error) {
    logger.error(`Error validating file path: ${error}`);
    return false;
  }
}
