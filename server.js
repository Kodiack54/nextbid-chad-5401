/**
 * Chad - AI Team Transcriber (Port 5401)
 * 
 * SIMPLIFIED: All capture goes through sourceWatcher -> dev_ai_sessions
 * No separate messages table, no GPT extraction in real-time
 */

require('dotenv').config();
const express = require('express');
const { WebSocketServer, WebSocket } = require('ws');
const cors = require('cors');
const http = require('http');

const app = express();
app.use(cors());
app.use(express.json());

// Team Chat routes
const teamChatRoutes = require('./src/routes/teamChat');
app.use('/api/team-chat', teamChatRoutes);

const PORT = process.env.PORT || 5401;
const SUSAN_URL = process.env.SUSAN_URL || 'http://localhost:5403';

// Multi-source watcher - THE source of truth for capture
const sourceWatcher = require('./src/services/sourceWatcher');

// Cataloger - extracts knowledge every 30 min and sends to Susan
const cataloger = require('./src/services/cataloger');

// Database
const supabase = require('../shared/db');

// Track active connections (for health check only)
const activeConnections = new Map();

// ============================================
// WebSocket Server - Receives terminal output
// ============================================

const server = http.createServer(app);
const wss = new WebSocketServer({ server });

wss.on('connection', async (ws, req) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const projectPath = url.searchParams.get('path') || '/unknown';
  const userId = url.searchParams.get('userId') || null;
  
  const connId = `${projectPath}-${Date.now()}`;
  activeConnections.set(connId, { projectPath, userId, connectedAt: new Date() });
  
  console.log(`[Chad] Connection from: ${projectPath}`);

  ws.on('message', (data) => {
    try {
      const msg = JSON.parse(data.toString());

      if (msg.type === 'output') {
        // Raw terminal output
        sourceWatcher.appendExternalClaude(msg.data);
      } else if (msg.type === 'user_input') {
        // User input from terminal
        sourceWatcher.appendExternalClaude(`[USER] ${msg.content}\n`);
      } else if (msg.type === 'message') {
        // Message from Claude Code hook
        const role = msg.role || 'user';
        const content = msg.content || '';
        const label = role === 'user' ? '[USER]' : '[ASSISTANT]';
        sourceWatcher.appendExternalClaude(`${label} ${content}\n`);
        console.log(`[Chad] Captured ${role}: ${content.slice(0, 50)}...`);
      }
    } catch (err) {
      // Raw text fallback
      sourceWatcher.appendExternalClaude(data.toString());
    }
  });

  ws.on('close', () => {
    console.log(`[Chad] Disconnected: ${projectPath}`);
    activeConnections.delete(connId);
  });

  ws.on('error', (err) => {
    console.error(`[Chad] WebSocket error: ${err.message}`);
  });
});

// ============================================
// HTTP API
// ============================================

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'chad-transcriber',
    port: PORT,
    activeConnections: activeConnections.size
  });
});

// Get active sessions from database
app.get('/api/sessions', async (req, res) => {
  try {
    const { data, error } = await supabase.from('dev_ai_sessions')
      .select('id, project_id, started_at, status')
      .eq('status', 'active')
      .order('started_at', { ascending: false });

    if (error) throw error;
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Recent sessions with content
app.get('/api/recent', async (req, res) => {
  const limit = parseInt(req.query.limit) || 20;
  const projectPath = req.query.project;

  try {
    let query = supabase.from('dev_ai_sessions')
      .select('id, project_id, started_at, ended_at, raw_content')
      .order('started_at', { ascending: false })
      .limit(limit);

    if (projectPath) {
      query = query.eq('project_id', projectPath);
    }

    const { data, error } = await query;
    if (error) throw error;

    // Format response
    const results = data.map(s => ({
      session_id: s.id,
      project_id: s.project_id,
      started_at: s.started_at,
      ended_at: s.ended_at,
      messages: [] // Raw content is in dev_ai_sessions, not parsed messages
    }));

    res.json(results);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================
// SOURCE WATCHER API
// ============================================

app.get('/api/sources/status', (req, res) => {
  res.json({
    success: true,
    sources: sourceWatcher.getStatus(),
    timestamp: new Date().toISOString()
  });
});

app.get('/api/sources/pending', async (req, res) => {
  try {
    const pending = await sourceWatcher.getPendingDumps();
    res.json({ success: true, pending, count: pending.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/sources/dump/:sourceId', async (req, res) => {
  try {
    const sessionId = await sourceWatcher.forceDump(req.params.sourceId);
    res.json({
      success: true,
      sessionId,
      message: sessionId ? 'Dump created' : 'No content to dump'
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/sources', (req, res) => {
  res.json({
    success: true,
    sources: Object.values(sourceWatcher.SOURCES).map(s => ({
      id: s.id,
      name: s.name,
      description: s.description,
      dumpSchedule: s.dumpMinutes.map(m => `:${m.toString().padStart(2, '0')}`)
    }))
  });
});

// ============================================
// CATALOGER API
// ============================================

app.post('/api/catalog/trigger', async (req, res) => {
  try {
    console.log('[Chad] Manual catalog trigger');
    await cataloger.runCatalog();
    res.json({ success: true, message: 'Catalog completed', timestamp: new Date().toISOString() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================
// Start Server
// ============================================

server.listen(PORT, async () => {
  try {
    await sourceWatcher.initialize();
    console.log('[Chad] Source watcher initialized');
  } catch (err) {
    console.error('[Chad] Source watcher init failed:', err.message);
  }

  try {
    cataloger.start();
    console.log('[Chad] Cataloger started');
  } catch (err) {
    console.error('[Chad] Cataloger start failed:', err.message);
  }

  console.log(`
====================================
  Chad - AI Team Transcriber
  Port: ${PORT}
====================================

  WebSocket: ws://localhost:${PORT}
  HTTP API:  http://localhost:${PORT}

  All capture -> sourceWatcher -> dev_ai_sessions

  Dump Schedule:
    :00,:05,... - External Claude
    :02,:07,... - Chat Systems  
    :04,:09,... - Internal Claude

  Ready.
====================================
  `);
});
