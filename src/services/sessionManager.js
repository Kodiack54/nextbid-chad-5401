/**
 * Chad Session Manager - SIMPLIFIED
 * Now just captures raw messages to staging table for Jen to process
 */

const { from } = require('../lib/db');
const { Logger } = require('../lib/logger');

const logger = new Logger('Chad:SessionManager');

// Active sessions: Map<sessionId, SessionState>
const activeSessions = new Map();

/**
 * Session State - Tracks a single transcription session
 */
class SessionState {
  constructor(sessionId, projectPath, userId) {
    this.sessionId = sessionId;
    this.projectPath = projectPath;
    this.userId = userId;
    this.sequenceNum = 0;
    this.startedAt = new Date().toISOString();
    this.lastActivity = Date.now();
  }

  /**
   * Store message to STAGING table for Jen to process
   */
  async storeMessage(role, content) {
    if (!content || content.trim().length === 0) return;
    
    this.sequenceNum++;
    this.lastActivity = Date.now();

    try {
      // Write to staging table - Jen will process this
      const { error } = await from('dev_ai_staging').insert({
        session_id: this.sessionId,
        project_path: this.projectPath,
        role,
        content: content.trim(),
        source: 'chad-5401',
        captured_at: new Date().toISOString(),
        processed: false
      });

      if (error) throw error;

      logger.info('Message captured to staging', {
        role,
        preview: content.slice(0, 50),
        sessionId: this.sessionId
      });

    } catch (err) {
      logger.error('Staging write failed', { error: err.message, sessionId: this.sessionId });
    }
  }

  async endSession() {
    const { error } = await from('dev_ai_sessions')
      .update({ ended_at: new Date().toISOString(), status: 'completed' })
      .eq('id', this.sessionId);

    if (error) {
      logger.error('End session failed', { error: error.message, sessionId: this.sessionId });
    }

    logger.info('Session ended', { sessionId: this.sessionId, projectPath: this.projectPath });
  }
}

/**
 * Session Manager API
 */
async function initialize() {
  logger.info('Session manager initialized (capture-only mode)');
  return true;
}

async function createSession(projectPath, userId, metadata = {}) {
  try {
    const { data, error } = await from('dev_ai_sessions')
      .insert({
        project_path: projectPath,
        user_id: userId,
        terminal_port: 5400,
        status: 'active',
        ...metadata
      })
      .select('id')
      .single();

    if (error) throw error;

    const session = new SessionState(data.id, projectPath, userId);
    activeSessions.set(data.id, session);

    logger.info('Session created', { sessionId: data.id, projectPath });
    return session;
  } catch (err) {
    logger.error('Session creation failed', { error: err.message, projectPath });
    throw err;
  }
}

function getSession(sessionId) {
  return activeSessions.get(sessionId);
}

function getActiveCount() {
  return activeSessions.size;
}

async function endSession(sessionId) {
  const session = activeSessions.get(sessionId);
  if (session) {
    await session.endSession();
    activeSessions.delete(sessionId);
  }
}

function getAllSessions() {
  return Array.from(activeSessions.values());
}

function getActiveSessionForProject(projectPath) {
  for (const session of activeSessions.values()) {
    if (session.projectPath === projectPath) {
      return session;
    }
  }
  return null;
}

module.exports = {
  initialize,
  createSession,
  getSession,
  getActiveCount,
  endSession,
  getAllSessions,
  getActiveSessionForProject,
  SessionState
};
