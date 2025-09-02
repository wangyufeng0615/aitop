import React, { useState } from 'react';
import { ClaudeSession, SessionStatus } from '../types';
import { formatTimeAgo, formatTime } from '../utils/dateFormat';
import './SessionCard.css';

interface SessionCardProps {
  session: ClaudeSession;
}

export const SessionCard: React.FC<SessionCardProps> = ({ session }) => {
  const [showTooltip, setShowTooltip] = useState(false);
  const [tooltipPosition, setTooltipPosition] = useState({ x: 0, y: 0 });

  const handleMouseEnter = (e: React.MouseEvent) => {
    const rect = e.currentTarget.getBoundingClientRect();
    setTooltipPosition({
      x: rect.right + 10,
      y: rect.top
    });
    setShowTooltip(true);
  };

  const handleMouseLeave = () => {
    setShowTooltip(false);
  };


  const formatMemoryMB = (percentage: number | undefined) => {
    if (percentage === undefined) return '0M';
    const totalMemoryGB = 16;
    const memoryMB = (totalMemoryGB * 1024 * percentage) / 100;
    return `${memoryMB.toFixed(0)}M`;
  };

  const formatCPU = (cpu: number | undefined) => {
    if (cpu === undefined) return '0%';
    return `${cpu.toFixed(1)}%`;
  };


  const getStatusClass = () => {
    switch (session.status) {
      case SessionStatus.RUNNING:
        return 'running';
      case SessionStatus.IDLE:
      default:
        return 'idle';
    }
  };

  return (
    <>
      <div 
        className={`session-card ${getStatusClass()}`}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      >
        <div className="card-content">
          <div className="card-left">
            <div className="session-info">
              <div className="project-name">
                {(() => {
                  // Prefer folder name from workingDir if available
                  const wd = session.workingDir || '';
                  const folder = wd ? wd.split('/').filter(Boolean).pop() : '';
                  return folder || session.displayName || `Session ${session.sessionId?.substring(0, 8) || session.pid}`;
                })()}
              </div>
              {session.workingDir && (
                <span className="project-path" title={session.workingDir}>
                  {session.workingDir.replace(/^\/Users\/[^/]+/, '~')}
                </span>
              )}
              <div className="session-meta">
                <span className="meta-item">
                  <span className={`meta-value status-${getStatusClass()}`}>{session.status}</span>
                </span>
                <span className="meta-item">
                  <span className="meta-label">Time:</span>
                  <span className="meta-value">{session.runningTime || '0:00:00'}</span>
                </span>
                <span className="meta-item">
                  <span className="meta-label">Idle:</span>
                  <span className="meta-value">{formatTimeAgo(session.lastActiveTime)}</span>
                </span>
                <span className="meta-item">
                  <span className="meta-label">CPU:</span>
                  <span className="meta-value">{formatCPU(session.cpuUsage)}</span>
                </span>
                <span className="meta-item">
                  <span className="meta-label">MEM:</span>
                  <span className="meta-value">{formatMemoryMB(session.memoryUsage)}</span>
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {showTooltip && (
        <div 
          className="session-tooltip"
          style={{
            position: 'fixed',
            left: `${tooltipPosition.x}px`,
            top: `${tooltipPosition.y}px`,
            zIndex: 1000
          }}
        >
          <div className="tooltip-header">
            <h4>Session Details</h4>
          </div>
          <div className="tooltip-content">
            {session.workingDir && (
              <div className="tooltip-row">
                <span className="tooltip-label">Path:</span>
                <span className="tooltip-value path">{session.workingDir}</span>
              </div>
            )}
            
            {session.pid && (
              <div className="tooltip-row">
                <span className="tooltip-label">PID:</span>
                <span className="tooltip-value">{session.pid}</span>
              </div>
            )}
            
            {session.sessionId && (
              <div className="tooltip-row">
                <span className="tooltip-label">Session ID:</span>
                <span className="tooltip-value mono">{session.sessionId.substring(0, 16)}...</span>
              </div>
            )}
            
            <div className="tooltip-row">
              <span className="tooltip-label">Started:</span>
              <span className="tooltip-value">{formatTime(session.startTime)}</span>
            </div>
            
            <div className="tooltip-row">
              <span className="tooltip-label">Last Active:</span>
              <span className="tooltip-value">{formatTime(session.lastActiveTime)}</span>
            </div>
            
            <div className="tooltip-separator"></div>
            
            <div className="tooltip-row">
              <span className="tooltip-label">CPU Usage:</span>
              <span className="tooltip-value">{session.cpuUsage?.toFixed(1) || '0.0'}%</span>
            </div>
            
            <div className="tooltip-row">
              <span className="tooltip-label">Memory:</span>
              <span className="tooltip-value">{formatMemoryMB(session.memoryUsage)}</span>
            </div>
            
          </div>
        </div>
      )}
    </>
  );
};
