import express from 'express';
import { WebSocketServer } from 'ws';
import path from 'path';
import fs from 'fs';
import { Coordinator } from './services/Coordinator';
import { ClaudeProcess } from './models/ClaudeProcess';
import { createLogger } from './utils/logger';
import { HookEventType } from './watchers/HookWatcher';

const logger = createLogger('server');

const app = express();
const PORT = 8998;

app.use(express.json());

// 创建协调器
const coordinator = new Coordinator();

// REST API
app.get('/api/sessions', (req, res) => {
  const processes = coordinator.getAllProcesses();
  res.json(processes);
});

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date() });
});

// HTTP Hooks endpoint (Claude Code hooks -> aitop)
app.post('/api/hooks/:type', (req, res) => {
  try {
    const typeParam = (req.params.type || '').toLowerCase();
    let eventType: HookEventType | null = null;
    if (typeParam === 'session_start') eventType = HookEventType.SESSION_START;
    if (typeParam === 'request_start') eventType = HookEventType.REQUEST_START;
    if (typeParam === 'request_stop') eventType = HookEventType.REQUEST_STOP;

    if (!eventType) {
      res.status(400).json({ error: 'invalid hook type' });
      return;
    }

    const body = req.body || {};
    if (!body.session_id) {
      res.status(400).json({ error: 'missing session_id' });
      return;
    }

    const event = {
      type: eventType,
      sessionId: body.session_id,
      transcriptPath: body.transcript_path,
      pid: body.pid,
      timestamp: new Date(),
    };

    coordinator.receiveHook(event as any);
    res.json({ status: 'ok' });
  } catch (error) {
    logger.error('Hook endpoint error:', error);
    res.status(500).json({ error: 'internal error' });
  }
});

// Serve static files
if (process.env.NODE_ENV === 'production') {
  // Production: serve built files from dist/public
  const staticDir = path.resolve(__dirname, 'public');
  app.use(express.static(staticDir));
  app.get('*', (req, res) => {
    if (!req.path.startsWith('/api/') && !req.path.startsWith('/ws')) {
      res.sendFile(path.join(staticDir, 'index.html'));
    } else {
      res.status(404).json({ error: 'Not found' });
    }
  });
} else {
  // Development: proxy to Vite dev server
  app.get('*', (req, res) => {
    if (!req.path.startsWith('/api/') && !req.path.startsWith('/ws')) {
      // Redirect to Vite dev server
      res.redirect(`http://localhost:5173${req.path}`);
    } else {
      res.status(404).json({ error: 'Not found' });
    }
  });
}

// 启动 HTTP 服务器 - 仅监听 localhost
const server = app.listen(PORT, '127.0.0.1', () => {
  logger.info(`Server running at http://localhost:${PORT}`);
});

// 创建 WebSocket 服务器
const wss = new WebSocketServer({ server, path: '/ws' });

// 心跳：每秒广播一次时间戳（轻量更新）
const heartbeat = setInterval(() => {
  const payload = JSON.stringify({ 
    type: 'tick', 
    timestamp: new Date(),
    // Include running duration updates
    sessions: coordinator.getAllProcesses()
  });
  for (const client of wss.clients) {
    try {
      if ((client as any).readyState === (client as any).OPEN) client.send(payload);
    } catch {
      // Ignore send errors
    }
  }
}, 1000);

// WebSocket 连接处理
wss.on('connection', (ws) => {
  logger.debug('New WebSocket connection');
  
  // 发送初始数据
  ws.send(JSON.stringify({
    type: 'init',
    data: coordinator.getAllProcesses(),
    timestamp: new Date()
  }));
  
  // 监听更新事件
  const handleUpdate = (processes: ClaudeProcess[]) => {
    if (ws.readyState === ws.OPEN) {
      ws.send(JSON.stringify({
        type: 'update',
        data: processes,
        timestamp: new Date()
      }));
    }
  };
  
  const handleProcessUpdate = (process: ClaudeProcess) => {
    if (ws.readyState === ws.OPEN) {
      ws.send(JSON.stringify({
        type: 'process:update',
        data: process,
        timestamp: new Date()
      }));
    }
  };
  
  const handleProcessRemove = (pid: number) => {
    if (ws.readyState === ws.OPEN) {
      ws.send(JSON.stringify({
        type: 'process:remove',
        data: pid,
        timestamp: new Date()
      }));
    }
  };
  
  coordinator.on('update', handleUpdate);
  coordinator.on('session:updated', handleProcessUpdate);
  coordinator.on('session:removed', (data: any) => handleProcessRemove(data.pid));
  
  ws.on('close', () => {
    logger.debug('WebSocket connection closed');
    coordinator.off('update', handleUpdate);
    coordinator.off('session:updated', handleProcessUpdate);
    coordinator.off('session:removed', handleProcessRemove);
  });
  
  ws.on('error', (error) => {
    logger.error('WebSocket error:', error);
  });
});

// 启动协调器
coordinator.start().catch(error => {
  logger.error('Failed to start coordinator:', error);
  process.exit(1);
});

// 优雅关闭
process.on('SIGINT', () => {
  logger.info('Shutting down...');
  coordinator.stop();
  wss.close();
  server.close();
  clearInterval(heartbeat);
  process.exit(0);
});
