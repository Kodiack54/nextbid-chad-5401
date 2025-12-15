/**
 * Chad Cataloger Service
 * Runs every 30 minutes to process raw session logs into structured knowledge
 *
 * Extracts:
 * - Todos (new and completed)
 * - Code changes
 * - Decisions made
 * - Knowledge/insights
 *
 * Sends to Susan for storage and doc updates
 */

const { from } = require('../lib/db');
const { chat } = require('../lib/claude');
const { Logger } = require('../lib/logger');
const config = require('../lib/config');

const logger = new Logger('Chad:Cataloger');

// Track last processed timestamp per project
const lastProcessed = new Map();

// Cataloger interval (30 minutes)
const CATALOG_INTERVAL_MS = 30 * 60 * 1000;

/**
 * Start the cataloger background job
 */
function start() {
  logger.info('Cataloger started', { intervalMs: CATALOG_INTERVAL_MS });

  // Run immediately on start
  setTimeout(() => runCatalog(), 5000);

  // Then every 30 minutes
  setInterval(() => runCatalog(), CATALOG_INTERVAL_MS);
}

/**
 * Run a single catalog cycle
 */
async function runCatalog() {
  logger.info('Starting catalog cycle');

  try {
    // Get active and recently completed sessions
    const { data: sessions, error } = await from('dev_ai_sessions')
      .select('id, project_path, started_at, ended_at, status, last_cataloged_at')
      .in('status', ['active', 'completed'])
      .order('started_at', { ascending: false })
      .limit(20);

    if (error) throw error;

    if (!sessions || sessions.length === 0) {
      logger.info('No sessions to catalog');
      return;
    }

    for (const session of sessions) {
      await catalogSession(session);
    }

    logger.info('Catalog cycle complete', { sessionsProcessed: sessions.length });
  } catch (err) {
    logger.error('Catalog cycle failed', { error: err.message });
  }
}

/**
 * Catalog a single session
 */
async function catalogSession(session) {
  try {
    // Get messages since last catalog
    const lastCataloged = session.last_cataloged_at || session.started_at;

    const { data: messages, error } = await from('dev_ai_messages')
      .select('role, content, created_at, sequence_num')
      .eq('session_id', session.id)
      .gt('created_at', lastCataloged)
      .order('sequence_num', { ascending: true });

    if (error) throw error;

    if (!messages || messages.length < 3) {
      // Not enough new messages to catalog
      return;
    }

    logger.info('Cataloging session', {
      sessionId: session.id,
      projectPath: session.project_path,
      newMessages: messages.length
    });

    // Build conversation text for extraction
    const conversationText = messages.map(m =>
      `${m.role.toUpperCase()}: ${m.content}`
    ).join('\n\n');

    // Extract structured data using Claude Haiku
    const extraction = await extractKnowledge(conversationText, session.project_path);

    if (extraction) {
      // Send to Susan for storage
      await sendToSusan(session.id, session.project_path, extraction);

      // Update last cataloged timestamp
      await from('dev_ai_sessions')
        .update({ last_cataloged_at: new Date().toISOString() })
        .eq('id', session.id);

      logger.info('Session cataloged', {
        sessionId: session.id,
        todos: extraction.todos?.length || 0,
        completedTodos: extraction.completedTodos?.length || 0,
        knowledge: extraction.knowledge?.length || 0
      });
    }
  } catch (err) {
    logger.error('Session catalog failed', {
      error: err.message,
      sessionId: session.id
    });
  }
}

/**
 * Use Claude Haiku to extract structured knowledge from conversation
 * COMPREHENSIVE EXTRACTION - Everything Susan needs for robust memory
 */
async function extractKnowledge(conversationText, projectPath) {
  const prompt = `You are Chad, the AI team's documentation specialist. Analyze this development conversation and extract EVERYTHING useful for our team's memory system.

CURRENT PROJECT: ${projectPath}

CONVERSATION:
${conversationText.slice(0, 12000)}

Extract ALL of the following as JSON. Be thorough - Susan needs this for long-term memory.
If user mentions a DIFFERENT project, include "targetProject" with that project name.

{
  "todos": [
    { "title": "task title", "description": "details", "priority": "critical|high|medium|low", "status": "pending|in_progress|completed", "assignedTo": "claude|chad|susan|tiffany|user", "targetProject": "if different project" }
  ],

  "completedTodos": [
    { "title": "task that was finished", "completedBy": "who did it", "targetProject": "if mentioned" }
  ],

  "commits": [
    { "hash": "commit hash if mentioned", "message": "commit message", "author": "who committed", "filesChanged": ["list of files"], "buildNumber": "if mentioned" }
  ],

  "codeChanges": [
    { "file": "path/to/file", "action": "created|modified|deleted|renamed|moved", "summary": "what changed", "linesAdded": 0, "linesRemoved": 0 }
  ],

  "structureChanges": [
    { "path": "folder/or/file/path", "name": "name", "type": "file|folder", "action": "created|deleted|renamed|deprecated|abandoned", "purpose": "what its for", "notes": "any context" }
  ],

  "schemaChanges": [
    { "table": "table_name", "action": "created|altered|dropped", "columns": ["column names"], "description": "what changed" }
  ],

  "bugs": [
    { "title": "bug description", "severity": "critical|high|medium|low", "file": "related file", "stepsToReproduce": "how to reproduce", "status": "open|fixed", "fixedBy": "what fixed it" }
  ],

  "decisions": [
    { "title": "what was decided", "rationale": "why this choice", "alternatives": ["other options considered"], "impact": "what this affects", "targetProject": "if mentioned" }
  ],

  "knowledge": [
    { "category": "code|architecture|bug|feature|api|database|deployment|security|performance|pattern", "title": "title", "summary": "what was learned", "importance": "critical|high|medium|low", "relatedFiles": ["files involved"], "targetProject": "if mentioned" }
  ],

  "apis": [
    { "endpoint": "/api/path", "method": "GET|POST|PATCH|DELETE", "description": "what it does", "parameters": ["params"], "response": "what it returns" }
  ],

  "ports": [
    { "port": 5000, "service": "service name", "description": "what runs here" }
  ],

  "dependencies": [
    { "package": "package-name", "action": "added|removed|updated", "version": "version if mentioned", "reason": "why" }
  ],

  "configChanges": [
    { "file": "config file", "setting": "what setting", "oldValue": "previous", "newValue": "new value", "reason": "why changed" }
  ],

  "documentation": [
    { "type": "readme|api|setup|architecture|comment", "file": "file path", "title": "doc title", "summary": "what was documented" }
  ],

  "errors": [
    { "error": "error message", "cause": "what caused it", "solution": "how it was fixed", "file": "related file" }
  ],

  "buildInfo": {
    "buildNumber": "if mentioned",
    "version": "if mentioned",
    "deployedTo": "environment if mentioned",
    "status": "success|failed"
  },

  "projectMentions": [
    { "project": "project name", "context": "why it was mentioned", "action": "what to do with it" }
  ]
}

IMPORTANT RULES:
1. Extract EVERYTHING - even small details matter for memory
2. If something is mentioned but unclear, still include it with what you know
3. Look for implicit information (e.g., if a file was edited, that's a codeChange)
4. Track WHO did what (user, claude, etc.)
5. Note relationships between items
6. Empty arrays are fine if nothing found for that category

Return valid JSON only.`;

  try {
    const response = await chat(prompt, { extractionMode: true });

    // Parse JSON from response
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }

    return null;
  } catch (err) {
    logger.error('Knowledge extraction failed', { error: err.message });
    return null;
  }
}

/**
 * Send extracted data to Susan for storage and doc updates
 */
async function sendToSusan(sessionId, projectPath, extraction) {
  try {
    const response = await fetch(`${config.SUSAN_URL}/api/catalog`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId,
        projectPath,
        extraction,
        catalogedAt: new Date().toISOString()
      })
    });

    if (!response.ok) {
      throw new Error(`Susan responded with ${response.status}`);
    }

    const result = await response.json();
    logger.info('Sent to Susan', { sessionId, result });
    return result;
  } catch (err) {
    logger.error('Failed to send to Susan', { error: err.message, sessionId });
    // Don't throw - Susan might be unavailable
    return null;
  }
}

/**
 * Force catalog a specific session (for manual triggers)
 */
async function catalogNow(sessionId) {
  const { data: session, error } = await from('dev_ai_sessions')
    .select('id, project_path, started_at, ended_at, status, last_cataloged_at')
    .eq('id', sessionId)
    .single();

  if (error || !session) {
    throw new Error('Session not found');
  }

  await catalogSession(session);
  return { success: true, sessionId };
}

module.exports = {
  start,
  runCatalog,
  catalogNow
};
