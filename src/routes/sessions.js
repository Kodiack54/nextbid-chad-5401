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
      .select('id, project_id, started_at, status')
      .eq('status', 'active')
      .order('started_at', { ascending: false });

    if (error) throw error;
    res.json(data);
  } catch (err) {
    logger.error('Failed to get sessions', { error: err.message });
    res.status(500).json({ error: err.message });
  }
});

// Get session messages (from staging if exists, otherwise from raw_content)
router.get('/sessions/:id/messages', async (req, res) => {
  try {
    // Try staging first
    const { data, error } = await from('dev_ai_staging')
      .select('role, content, created_at')
      .eq('session_id', req.params.id)
      .order('created_at', { ascending: true });

    if (error) throw error;
    res.json(data || []);
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
    const { error } = await from('dev_ai_staging').insert({
      session_id: sessionId,
      role,
      content,
      created_at: new Date().toISOString()
    });

    if (error) throw error;
    res.json({ success: true });
  } catch (err) {
    logger.error('Failed to store message', { error: err.message, sessionId });
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/session/recover - Crash recovery endpoint
 */
router.get('/session/recover', async (req, res) => {
  const projectPath = req.query.project;

  if (!projectPath) {
    return res.status(400).json({ error: 'project query param required' });
  }

  try {
    // First check for active session in memory
    const activeSession = sessionManager.getActiveSessionForProject(projectPath);
    if (activeSession) {
      return res.json({
        status: 'active',
        sessionId: activeSession.sessionId,
        projectPath: activeSession.projectPath,
        startedAt: activeSession.startedAt,
        messageCount: 0,
        messages: [],
        summary: 'Active session in memory'
      });
    }

    // Get most recent session from database
    const { data: sessions, error: sessionsError } = await from('dev_ai_sessions')
      .select('id, project_id, started_at, ended_at, status, summary, raw_content')
      .eq('project_id', projectPath)
      .order('started_at', { ascending: false })
      .limit(1);

    if (sessionsError) throw sessionsError;

    if (!sessions || sessions.length === 0) {
      return res.json({
        status: 'none',
        message: 'No previous sessions found for this project'
      });
    }

    const session = sessions[0];

    res.json({
      status: session.status,
      sessionId: session.id,
      projectPath: session.project_id,
      startedAt: session.started_at,
      endedAt: session.ended_at,
      storedSummary: session.summary,
      rawContentLength: session.raw_content?.length || 0,
      summary: session.summary || 'Session recovered from database'
    });

    logger.info('Session recovery served', {
      projectPath,
      sessionId: session.id
    });
  } catch (err) {
    logger.error('Session recovery failed', { error: err.message, projectPath });
    res.status(500).json({ error: err.message });
  }
});

// Recent conversations
router.get('/recent', async (req, res) => {
  const limit = parseInt(req.query.limit) || 20;
  const projectPath = req.query.project;

  try {
    let query = from('dev_ai_sessions')
      .select('id, project_id, started_at, ended_at, raw_content')
      .order('started_at', { ascending: false })
      .limit(limit);

    if (projectPath) {
      query = query.eq('project_id', projectPath);
    }

    const { data: sessions, error: sessionsError } = await query;
    if (sessionsError) throw sessionsError;

    const results = (sessions || []).map(s => ({
      session_id: s.id,
      project_id: s.project_id,
      started_at: s.started_at,
      ended_at: s.ended_at,
      messages: [] // Raw content is in dev_ai_sessions now
    }));

    res.json(results);
  } catch (err) {
    logger.error('Failed to get recent sessions', { error: err.message });
    res.status(500).json({ error: err.message });
  }
});

// Sessions for UI (with proper format)
router.get('/sessions/recent', async (req, res) => {
  const limit = parseInt(req.query.limit) || 20;

  try {
    const { data, error } = await from('dev_ai_sessions')
      .select('id, project_id, started_at, ended_at, status, source_type, source_name, message_count, raw_content')
      .order('started_at', { ascending: false })
      .limit(limit);

    if (error) throw error;

    const sessions = (data || []).map(s => ({
      id: s.id,
      title: s.source_name || s.source_type || 'Session',
      status: s.status,
      started_at: s.started_at,
      ended_at: s.ended_at,
      source_type: s.source_type,
      source_name: s.source_name,
      message_count: s.message_count || 0,
      project_id: s.project_id,
      needs_review: s.status === 'pending_review',
      processed_by_susan: s.status === 'processed'
    }));

    res.json({ success: true, sessions });
  } catch (err) {
    logger.error('Failed to get recent sessions', { error: err.message });
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/external-claude - Receive messages from Windows file watcher
 */
router.post('/external-claude', async (req, res) => {
  const { role, content, session_id, timestamp, source, cwd, project, display_name } = req.body;

  if (!content || !session_id) {
    return res.status(400).json({ success: false, error: 'content and session_id required' });
  }

  try {
    let { data: session } = await from('dev_ai_sessions')
      .select('id, raw_content, message_count')
      .eq('source_name', session_id)
      .eq('source_type', 'external_claude')
      .single();

    if (!session) {
      const { data: newSession, error: createError } = await from('dev_ai_sessions')
        .insert({
          source_type: 'external_claude',
          source_name: session_id,
          summary: display_name || 'Claude External',
          project_id: cwd || project || 'external-unknown',
          status: 'active',
          started_at: timestamp || new Date().toISOString(),
          raw_content: '',
          message_count: 0
        })
        .select()
        .single();

      if (createError) throw createError;
      session = newSession;
      logger.info('Created external session', { sessionId: session.id, displayName: display_name });
    }

    const separator = session.raw_content ? '\n\n---\n\n' : '';
    const newContent = separator + (role || 'unknown').toUpperCase() + ': ' + content;

    const { error: updateError } = await from('dev_ai_sessions')
      .update({
        raw_content: (session.raw_content || '') + newContent,
        last_message_at: new Date().toISOString(),
        status: 'active',
        message_count: (session.message_count || 0) + 1
      })
      .eq('id', session.id);

    if (updateError) throw updateError;

    res.json({ success: true, sessionId: session.id });
  } catch (err) {
    logger.error('External claude capture failed', { error: err.message, sessionId: session_id });
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
