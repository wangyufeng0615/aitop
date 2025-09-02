import fs from 'fs';
import path from 'path';
import os from 'os';
import { EventEmitter } from 'events';
import { createLogger } from '../utils/logger';

const logger = createLogger('HookWatcher');

export enum HookEventType {
  SESSION_START = 'session_start',
  REQUEST_START = 'request_start',
  REQUEST_STOP = 'request_stop'
}

export interface HookEvent {
  type: HookEventType;
  sessionId: string;
  transcriptPath?: string;
  pid?: number;
  timestamp: Date;
}

/**
 * HookWatcher - Configure Claude Code to send HTTP hooks to cctop
 * 
 * Responsibilities:
 * - Ensure hooks in ~/.claude/settings.json send JSON to local HTTP endpoint
 * - No file watching and no local cache/state files
 */
export class HookWatcher extends EventEmitter {
  // HTTP hooks mode: no file watchers
  
  /**
   * Ensure hooks are configured in Claude Code settings
   */
  private ensureHooksConfigured(): void {
    try {
      const settingsPath = path.join(os.homedir(), '.claude', 'settings.json');
      const claudeDir = path.join(os.homedir(), '.claude');

      // Ensure .claude directory exists
      if (!fs.existsSync(claudeDir)) {
        fs.mkdirSync(claudeDir, { recursive: true });
        logger.info(`Created Claude directory: ${claudeDir}`);
      }

      // Read existing settings or create new
      let settings: any = {};
      const fileExists = fs.existsSync(settingsPath);
      
      if (fileExists) {
        try {
          const content = fs.readFileSync(settingsPath, 'utf-8');
          settings = JSON.parse(content);
          logger.debug('Found existing Claude Code settings');
        } catch (error) {
          logger.error('Could not parse Claude Code settings:', error);
          settings = {};
        }
      }

      // Configure hooks to POST JSON to local HTTP endpoint
      const port = '8998';
      const base = `http://127.0.0.1:${port}/api/hooks`;
      const sessionStartCommand = `curl -sS -X POST -H "Content-Type: application/json" --data-binary @- ${base}/session_start`;
      const userPromptCommand = `curl -sS -X POST -H "Content-Type: application/json" --data-binary @- ${base}/request_start`;
      const stopCommand = `curl -sS -X POST -H "Content-Type: application/json" --data-binary @- ${base}/request_stop`;
      
      const hasCorrectHooks = 
        settings.hooks?.SessionStart?.[0]?.hooks?.[0]?.command === sessionStartCommand &&
        settings.hooks?.UserPromptSubmit?.[0]?.hooks?.[0]?.command === userPromptCommand &&
        settings.hooks?.Stop?.[0]?.hooks?.[0]?.command === stopCommand;

      if (hasCorrectHooks) {
        logger.info('Claude Code hooks are already configured for HTTP');
        return;
      }

      // Configure hooks
      if (!settings.hooks) settings.hooks = {};
      
      settings.hooks.SessionStart = [{
        hooks: [{ type: "command", command: sessionStartCommand }]
      }];
      
      settings.hooks.UserPromptSubmit = [{
        hooks: [{ type: "command", command: userPromptCommand }]
      }];
      
      settings.hooks.Stop = [{
        hooks: [{ type: "command", command: stopCommand }]
      }];

      // Write updated settings
      fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
      logger.info('Claude Code HTTP hooks configured successfully');
    } catch (error) {
      logger.error('Failed to configure Claude Code hooks:', error);
    }
  }
  
  /**
   * Start in HTTP mode: only ensure hooks are configured.
   */
  async start(): Promise<void> {
    logger.info('Configuring Claude Code HTTP hooks...');
    this.ensureHooksConfigured();
  }
  
  /**
   * Stop: nothing to do in HTTP mode.
   */
  stop(): void {
    logger.info('Hook HTTP mode active; nothing to stop');
  }
  
  /**
   * HTTP mode is always considered running once configured.
   */
  isRunning(): boolean {
    return true;
  }
}
