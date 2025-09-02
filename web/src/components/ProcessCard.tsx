import React from 'react';
import { ClaudeProcess, ProcessStatus } from '../types';
import { formatTimeAgo } from '../utils/dateFormat';

interface ProcessCardProps {
  process: ClaudeProcess;
}

export const ProcessCard: React.FC<ProcessCardProps> = ({ process }) => {
  const getStatusIcon = (status: ProcessStatus) => {
    switch (status) {
      case ProcessStatus.RUNNING:
        return '🤖';
      case ProcessStatus.IDLE:
        return '💤';
      default:
        return '❓';
    }
  };

  const getStatusColor = (status: ProcessStatus) => {
    switch (status) {
      case ProcessStatus.RUNNING:
        return '#10b981'; // green
      case ProcessStatus.IDLE:
        return '#6b7280'; // gray
      default:
        return '#6b7280';
    }
  };

  const getStatusText = (status: ProcessStatus) => {
    switch (status) {
      case ProcessStatus.RUNNING:
        return 'Running';
      case ProcessStatus.IDLE:
        return 'Idle';
      default:
        return 'Unknown';
    }
  };


  const isActive = process.status === ProcessStatus.RUNNING;

  const statusColor = getStatusColor(process.status);
  
  return (
    <div 
      className="process-card"
      style={{
        borderLeft: `3px solid ${statusColor}`,
        backgroundColor: isActive ? `${statusColor}08` : '#0d0d0d'
      }}
    >
      <div className="card-compact">
        <div className="card-left">
          <div className="card-status-bar">
            <span className="status-icon" style={{ color: statusColor }}>
              {getStatusIcon(process.status)}
            </span>
            <span className="status-text" style={{ color: statusColor }}>
              {getStatusText(process.status).toUpperCase()}
            </span>
          </div>
          <div className="project-info">
            <span className="project-name">{process.displayName || `Session ${process.sessionId?.substring(0, 8) || process.pid}`}</span>
            {process.workingDir && (
              <span className="project-path" title={process.workingDir}>
                {process.workingDir.replace(/^\/Users\/[^/]+/, '~')}
              </span>
            )}
          </div>
        </div>
        
        <div className="card-right">
          <div className="metric-item">
            <span className="metric-label">TIME</span>
            <span className="metric-value" style={{ color: statusColor }}>
              {process.runningTime}
            </span>
          </div>
          <div className="metric-item">
            <span className="metric-label">LAST</span>
            <span className="metric-value">
              {formatTimeAgo(process.lastActiveTime)}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
