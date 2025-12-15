/**
 * Claude TUI Extractor
 * Extracts conversation messages from Claude Code terminal output
 */

const { extractConversation } = require('../../lib/openai');
const { Logger } = require('../../lib/logger');

const logger = new Logger('Chad:ClaudeTUIExtractor');

module.exports = {
  name: 'claude-tui',

  /**
   * Check if this extractor should handle the content
   */
  matches(content, metadata) {
    // Check for Claude TUI patterns
    const patterns = [
      /Human:/i,
      /Assistant:/i,
      />\s*$/m,
      /Thinking\.\.\./i,
      /Using tool:/i,
      /Tool result:/i,
      /[●○]\s+/,  // Summary bullet points
      /Claude/i
    ];

    return patterns.some(p => p.test(content));
  },

  /**
   * Extract messages from Claude TUI output
   */
  async extract(content, context) {
    try {
      // Use GPT to extract conversation
      const messages = await extractConversation(content);

      if (!messages || !Array.isArray(messages)) {
        // Fallback to simple extraction
        return this.extractSimple(content, context);
      }

      logger.info('Extracted messages', {
        count: messages.length,
        sessionId: context.sessionId
      });

      return {
        messages: messages.filter(m => m.role && m.content && m.content.trim()),
        metadata: {
          extractor: 'claude-tui',
          method: 'gpt',
          timestamp: Date.now()
        }
      };
    } catch (err) {
      logger.error('GPT extraction failed, using fallback', {
        error: err.message,
        sessionId: context.sessionId
      });

      return this.extractSimple(content, context);
    }
  },

  /**
   * Simple regex-based extraction fallback
   */
  extractSimple(content, context) {
    const messages = [];

    // Extract bullet point summaries (assistant messages)
    const bulletMatches = content.match(/[●○]\s+(.+?)(?:\n|$)/g);
    if (bulletMatches) {
      bulletMatches.forEach(match => {
        const text = match.replace(/^[●○]\s*/, '').trim();
        if (text.length > 10) {
          messages.push({
            role: 'assistant',
            content: text
          });
        }
      });
    }

    // Extract Human: prefixed content
    const humanMatches = content.match(/Human:\s*(.+?)(?=\n(?:Assistant:|Human:|$))/gs);
    if (humanMatches) {
      humanMatches.forEach(match => {
        const text = match.replace(/^Human:\s*/i, '').trim();
        if (text.length > 5) {
          messages.push({
            role: 'human',
            content: text
          });
        }
      });
    }

    // Extract Assistant: prefixed content
    const assistantMatches = content.match(/Assistant:\s*(.+?)(?=\n(?:Assistant:|Human:|$))/gs);
    if (assistantMatches) {
      assistantMatches.forEach(match => {
        const text = match.replace(/^Assistant:\s*/i, '').trim();
        if (text.length > 10) {
          messages.push({
            role: 'assistant',
            content: text
          });
        }
      });
    }

    logger.info('Simple extraction complete', {
      count: messages.length,
      sessionId: context.sessionId
    });

    return {
      messages,
      metadata: {
        extractor: 'claude-tui',
        method: 'simple',
        timestamp: Date.now()
      }
    };
  }
};
