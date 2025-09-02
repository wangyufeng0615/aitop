import { useEffect, useState } from 'react';
import { ClaudeSession } from '../types';

interface WSMessage {
  type: 'init' | 'update' | 'session:update' | 'session:remove' | 'tick';
  data?: ClaudeSession[] | ClaudeSession | string; // string for session:remove (sessionId)
  sessions?: ClaudeSession[]; // For tick messages
  timestamp: string;
}

export function useWebSocket() {
  const [sessions, setSessions] = useState<ClaudeSession[]>([]);
  const [connected, setConnected] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    let ws: WebSocket;
    let reconnectTimeout: NodeJS.Timeout;

    const connect = () => {
      const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
      const wsUrl = `${protocol}://${window.location.host}/ws`;
      ws = new WebSocket(wsUrl);

      ws.onopen = () => {
        console.log('WebSocket connected');
        setConnected(true);
      };

      ws.onmessage = (event) => {
        try {
          const message: WSMessage = JSON.parse(event.data);
          setLastUpdate(new Date(message.timestamp));

          switch (message.type) {
            case 'init':
              setInitialized(true);
              setSessions(message.data as ClaudeSession[]);
              break;
              
            case 'update':
              setSessions(message.data as ClaudeSession[]);
              break;
              
            case 'tick':
              // Update sessions with new duration data
              if (message.sessions) {
                setSessions(message.sessions);
              }
              break;
              
            case 'session:update': {
              const updatedSession = message.data as ClaudeSession;
              setSessions(prev => {
                const index = prev.findIndex(s => s.sessionId === updatedSession.sessionId);
                if (index >= 0) {
                  const newSessions = [...prev];
                  newSessions[index] = updatedSession;
                  return newSessions;
                } else {
                  return [...prev, updatedSession];
                }
              });
              break;
            }
              
            case 'session:remove': {
              const removedSessionId = message.data as string;
              setSessions(prev => prev.filter(s => s.sessionId !== removedSessionId));
              break;
            }
          }
        } catch (error) {
          console.error('Failed to parse WebSocket message:', error);
        }
      };

      ws.onerror = (error) => {
        console.error('WebSocket error:', error);
        setConnected(false);
      };

      ws.onclose = () => {
        console.log('WebSocket disconnected');
        setConnected(false);
        
        // 重连
        reconnectTimeout = setTimeout(() => {
          console.log('Attempting to reconnect...');
          connect();
        }, 3000);
      };
    };

    connect();

    return () => {
      if (ws) {
        ws.close();
      }
      if (reconnectTimeout) {
        clearTimeout(reconnectTimeout);
      }
    };
  }, []);

  return { sessions, connected, lastUpdate, initialized };
}