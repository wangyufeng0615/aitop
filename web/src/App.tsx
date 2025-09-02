import React, { useEffect, useRef, useState } from 'react';
import { useWebSocket } from './hooks/useWebSocket';
import { SessionCard } from './components/SessionCard';
import { SessionStatus } from './types';
import './App.css';
import { useSound } from './hooks/useSound';

function App() {
  const { sessions, connected, lastUpdate, initialized } = useWebSocket();
  const { beep, resume } = useSound();
  const [soundEnabled, setSoundEnabled] = useState<boolean>(() => {
    try { return localStorage.getItem('ccm_sound_enabled') === '1'; } catch { return false; }
  });

  const prevStatus = useRef<Map<string, SessionStatus>>(new Map());
  const resumedOnceRef = useRef<boolean>(false);

  useEffect(() => {
    // 当会话状态由 RUNNING -> IDLE 时发声
    if (!initialized) return;
    for (const s of sessions) {
      const prev = prevStatus.current.get(s.sessionId);
      if (prev === SessionStatus.RUNNING && s.status === SessionStatus.IDLE) {
        if (soundEnabled) {
          beep({ freq: 880, durationMs: 160, volume: 0.04 });
        }
      }
      prevStatus.current.set(s.sessionId, s.status);
    }
    // 清理已移除的会话
    const current = new Set(sessions.map(s => s.sessionId));
    for (const sessionId of Array.from(prevStatus.current.keys())) {
      if (!current.has(sessionId)) prevStatus.current.delete(sessionId);
    }
  }, [sessions, initialized, soundEnabled, beep]);

  const toggleSound = async () => {
    const next = !soundEnabled;
    setSoundEnabled(next);
    try { localStorage.setItem('ccm_sound_enabled', next ? '1' : '0'); } catch {
      // Ignore localStorage errors
    }
    if (next) {
      await resume();
      resumedOnceRef.current = true;
      // 反馈一下
      beep({ freq: 1200, durationMs: 120, volume: 0.05 });
    }
  };

  // 若用户已开启声音但本次加载未与页面交互，尝试在任意首次交互时恢复音频上下文
  useEffect(() => {
    if (!soundEnabled || resumedOnceRef.current) return;
    const tryResume = async () => {
      if (resumedOnceRef.current) return;
      await resume();
      resumedOnceRef.current = true;
    };
    const handlers: Array<[string, () => Promise<void>]> = [
      ['pointerdown', tryResume],
      ['keydown', tryResume],
      ['touchstart', tryResume]
    ];
    handlers.forEach(([evt, fn]) => document.addEventListener(evt, fn as EventListener, { once: true, passive: true }));
    return () => {
      handlers.forEach(([evt, fn]) => document.removeEventListener(evt, fn as EventListener));
    };
  }, [soundEnabled, resume]);

  // 排序：按开始时间从早到晚
  const sortedSessions = [...sessions].sort((a, b) => {
    return new Date(a.startTime).getTime() - new Date(b.startTime).getTime();
  });

  return (
    <div className="app">
      <header className="app-header">
        <h1>CCTop</h1>
        <div className="header-info">
          <span className="session-count">{sessions.length} sessions</span>
          <span className="separator">|</span>
          <span className={`connection-status ${connected ? 'connected' : 'disconnected'}`}>
            {connected ? 'Connected' : 'Disconnected'}
          </span>
          <span className="separator">|</span>
          <button className={`sound-toggle ${soundEnabled ? 'enabled' : ''}`} onClick={toggleSound}>
            {soundEnabled ? '🔔 Sound On' : '🔕 Sound Off'}
          </button>
          {lastUpdate && (
            <>
              <span className="separator">|</span>
              <span className="last-update">
                Updated: {new Date(lastUpdate).toLocaleTimeString()}
              </span>
            </>
          )}
        </div>
      </header>

      <main className="app-main">
        {!initialized ? (
          <div className="loading">
            <div className="spinner" />
            <p>Connecting to monitor service...</p>
          </div>
        ) : sortedSessions.length === 0 ? (
          <div className="no-sessions">
            <p>No Claude Code sessions detected</p>
            <p className="hint">Start Claude Code in your terminal to see it here</p>
          </div>
        ) : (
          <div className="session-list">
            {sortedSessions.map((session) => (
              <SessionCard key={session.sessionId} session={session} />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

export default App;
