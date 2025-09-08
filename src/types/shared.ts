// Shared types between backend and frontend

export enum SessionStatus {
  IDLE = 'idle',
  RUNNING = 'running'
}

// Alias for backward compatibility
export { SessionStatus as ProcessStatus };

// This is the main data structure sent from backend to frontend
export interface ClaudeProcess {
  pid: number;
  sessionId?: string;
  displayName?: string;  // Display name (sessionId prefix or PID)
  status: SessionStatus;
  cpuUsage: number;
  memoryUsage: number;
  startTime: Date;
  runningTime: string;
  lastActiveTime: Date;
  firstSeenAt: Date;
  sequenceNumber?: number;
  runningDuration?: number;
  workingDir?: string | null;  // Optional working directory
}

// Frontend may use this alias for display purposes
export interface ClaudeSession extends ClaudeProcess {}

export interface LogMessage {
  parentUuid?: string;
  sessionId: string;
  timestamp: string;
  type: 'user' | 'assistant';
  message?: {
    role: 'user' | 'assistant';
    content?: Array<{
      type: 'text' | 'tool_use' | 'tool_result' | 'thinking';
      name?: string;
      text?: string;
      tool_use_id?: string; // present on tool_result
      id?: string; // present on tool_use (e.g., toolu_...)
    }>;
    stop_reason?: 'tool_use' | 'end_turn' | 'stop_sequence' | null;
    id?: string; // message ID for tracking updates
  };
}