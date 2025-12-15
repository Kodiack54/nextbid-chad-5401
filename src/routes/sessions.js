/**
 * Chad Sessions Routes
 * Handles session CRUD and message management
 */

const express = require('express');
const router = express.Router();
const { from } = require('../lib/db');
const { Logger } = require('../lib/logger');
const sessionManager = require('../services/sessionManager');

const logger = new Logger('Chad:Sessions');

// Get active sessions
router.get('/sessions', async (req, res) => {
  try {
    const { data, error } = await from('dev_ai_sessions')
      .select('id, project_path, started_at, status')
      .eq('status', 'active')
      .order('started_at', { ascending: false });

    if (error) throw error;
    res.json(data);
  } catch (err) {
    logger.error('Failed to get sessions', { error: err.message });
    res.status(500).json({ error: err.message });
  }
});

// Get session messages
router.get('/sessions/:id/messages', async (req, res) => {
  try {
    const { data, error } = await from('dev_ai_messages')
      .select('role, content, created_at')
      .eq('session_id', req.params.id)
      .order('sequence_num', { ascending: true });

    if (error) throw error;
    res.json(data);
  } catch (err) {
    logger.error('Failed to get session messages', { error: err.message, sessionId: req.params.id });
    res.status(500).json({ error: err.message });
  }
});

// Manual message store
router.post('/message', async (req, res) => {
  const { sessionId, role, content } = req.body;

  // Try to use active session first
  const session = sessionManager.getSession(sessionId);
  if (session) {
    await session.storeMessage(role, content);
    return res.json({ success: true });
  }

  // Store directly if session not in memory
  try {
    const { data: maxData } = await from('dev_ai_messages')
      .select('sequence_num')
      .eq('session_id', sessionId)
      .order('sequence_num', { ascending: false })
      .limit(1)
      .single();

    const seq = (maxData?.sequence_num || 0) + 1;

    const { error } = await from('dev_ai_messages').insert({
      session_id: sessionId,
      role,
      content,
      sequence_num: seq
    });

    if (error) throw error;
    res.json({ success: true });
  } catch (err) {
    logger.error('Failed to store message', { error: err.message, sessionId });
    res.status(500).json({ error: err.message });
  }
});

// Recent conversations
router.get('/recent', async (req, res) => {
  const limit = parseInt(req.query.limit) || 20;
  const projectPath = req.query.project;

  try {
    let query = from('dev_ai_sessions')
      .select('id, project_path, started_at, ended_at')
      .order('started_at', { ascending: false })
      .limit(limit);

    if (projectPath) {
      query = query.eq('project_path', projectPath);
    }

    const { data: sessions, error: sessionsError } = await query;
    if (sessionsError) throw sessionsError;

    // Get messages for each session
    const results = await Promise.all(sessions.map(async (session) => {
      const { data: messages } = await from('dev_ai_messages')
        .select('role, content, created_at')
        .eq('session_id', session.id)
        .order('sequence_num', { ascending: true });

      return {
        session_id: session.id,
        project_path: session.project_path,
        started_at: session.started_at,
        ended_at: session.ended_at,
        messages: messages || []
      };
    }));

    res.json(results);
  } catch (err) {
    logger.error('Failed to get recent sessions', { error: err.message });
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
