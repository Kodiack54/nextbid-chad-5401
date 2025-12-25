/**
 * Extraction Store - Handles storing extracted items to database
 * Supports: todos, knowledge, errors, decisions
 */

const { from } = require('../lib/db');
const { Logger } = require('../lib/logger');

const logger = new Logger('Chad:ExtractionStore');

/**
 * Store extracted TODOs
 */
async function storeTodos(sessionId, projectPath, todos) {
  if (!todos?.length) return 0;
  
  let stored = 0;
  for (const todo of todos) {
    try {
      await from('dev_ai_smart_extractions').insert({
        session_id: sessionId,
        project_id: projectPath,
        extraction_type: 'todo',
        category: 'todo',
        content: typeof todo === 'string' ? todo : todo.content || JSON.stringify(todo),
        priority: todo.priority || 'normal',
        status: 'pending',
        metadata: { source: 'chad_extraction', extractedAt: new Date().toISOString() }
      });
      stored++;
    } catch (err) {
      logger.debug('Failed to store todo', { error: err.message });
    }
  }
  logger.info('Stored todos', { count: stored, sessionId });
  return stored;
}

/**
 * Store knowledge snippets
 */
async function storeKnowledge(sessionId, projectPath, items) {
  if (!items?.length) return 0;
  
  let stored = 0;
  for (const item of items) {
    try {
      await from('dev_ai_smart_extractions').insert({
        session_id: sessionId,
        project_id: projectPath,
        extraction_type: 'knowledge',
        category: item.category || 'general',
        content: typeof item === 'string' ? item : item.content || JSON.stringify(item),
        status: 'pending',
        metadata: { 
          source: 'chad_extraction',
          extractedAt: new Date().toISOString(),
          tags: item.tags || []
        }
      });
      stored++;
    } catch (err) {
      logger.debug('Failed to store knowledge', { error: err.message });
    }
  }
  logger.info('Stored knowledge', { count: stored, sessionId });
  return stored;
}

/**
 * Store errors/issues found
 */
async function storeErrors(sessionId, projectPath, errors) {
  if (!errors?.length) return 0;
  
  let stored = 0;
  for (const error of errors) {
    try {
      await from('dev_ai_smart_extractions').insert({
        session_id: sessionId,
        project_id: projectPath,
        extraction_type: 'error',
        category: 'issue',
        content: typeof error === 'string' ? error : error.message || JSON.stringify(error),
        priority: 'high',
        status: 'pending',
        metadata: { source: 'chad_extraction', extractedAt: new Date().toISOString() }
      });
      stored++;
    } catch (err) {
      logger.debug('Failed to store error', { error: err.message });
    }
  }
  return stored;
}

/**
 * Extract and store from raw dump content
 */
async function extractAndStoreFromDump(sessionId, projectPath, rawContent) {
  if (!rawContent) return { todos: 0, knowledge: 0, errors: 0 };
  
  // Extract TODOs
  const todoPatterns = [
    /(?:TODO|TASK|NEED TO|SHOULD|MUST)[\s:]+([^\n.]{10,200})/gi,
    /\[ \]\s+([^\n]{10,150})/g,  // Markdown unchecked boxes
    /- pending[:\s]+([^\n]{10,150})/gi
  ];
  
  const todos = [];
  for (const pattern of todoPatterns) {
    let match;
    while ((match = pattern.exec(rawContent)) !== null) {
      const content = match[1].trim();
      if (content.length > 10 && !todos.includes(content)) {
        todos.push(content);
      }
    }
  }
  
  // Extract knowledge (decisions, discoveries, configs)
  const knowledgePatterns = [
    { pattern: /(?:decided|decision)[\s:]+([^\n]{20,300})/gi, category: 'decision' },
    { pattern: /(?:discovered|found that|learned)[\s:]+([^\n]{20,300})/gi, category: 'discovery' },
    { pattern: /(?:config|configuration|setting)[\s:]+([^\n]{20,200})/gi, category: 'config' },
    { pattern: /(?:port|endpoint|url)[\s:]+(\d{4,5}|https?:\/\/[^\s]+)/gi, category: 'infrastructure' },
    { pattern: /(?:bug|issue|problem)[\s:]+([^\n]{20,300})/gi, category: 'bug' },
    { pattern: /(?:fix|fixed|solution)[\s:]+([^\n]{20,300})/gi, category: 'solution' }
  ];
  
  const knowledge = [];
  for (const { pattern, category } of knowledgePatterns) {
    let match;
    while ((match = pattern.exec(rawContent)) !== null) {
      knowledge.push({ content: match[1].trim(), category });
    }
  }
  
  // Extract errors
  const errorPatterns = [
    /(?:error|failed|exception|crash)[\s:]+([^\n]{15,200})/gi,
    /(?:cannot|could not|unable to)[\s]+([^\n]{15,150})/gi
  ];
  
  const errors = [];
  for (const pattern of errorPatterns) {
    let match;
    while ((match = pattern.exec(rawContent)) !== null) {
      errors.push(match[1].trim());
    }
  }
  
  // Store all extractions
  const todoCount = await storeTodos(sessionId, projectPath, todos.slice(0, 20));
  const knowledgeCount = await storeKnowledge(sessionId, projectPath, knowledge.slice(0, 30));
  const errorCount = await storeErrors(sessionId, projectPath, errors.slice(0, 10));
  
  return { todos: todoCount, knowledge: knowledgeCount, errors: errorCount };
}

/**
 * Get pending extractions by type
 */
async function getPendingByType(type, limit = 50) {
  try {
    const { data, error } = await from('dev_ai_smart_extractions')
      .select('*')
      .eq('extraction_type', type)
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
      .limit(limit);
    
    if (error) throw error;
    return data || [];
  } catch (err) {
    logger.error('Failed to get pending extractions', { error: err.message, type });
    return [];
  }
}

/**
 * Mark extraction as processed by Susan
 */
async function markProcessed(extractionId) {
  try {
    await from('dev_ai_smart_extractions')
      .update({ status: 'processed' })
      .eq('id', extractionId);
    return true;
  } catch (err) {
    return false;
  }
}

module.exports = {
  storeTodos,
  storeKnowledge,
  storeErrors,
  extractAndStoreFromDump,
  getPendingByType,
  markProcessed
};
