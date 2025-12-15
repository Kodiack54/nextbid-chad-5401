/**
 * Bash Output Extractor
 * Extracts meaningful information from bash/terminal command output
 * Filters noise, captures errors, and summarizes long outputs
 */

const { Logger } = require('../../lib/logger');

const logger = new Logger('Chad:BashExtractor');

// Patterns to filter out (noise)
const NOISE_PATTERNS = [
  /^\s*$/,
  /^[\s\-=]+$/,
  /^\d+\s*$/,
  /^Progress:/i,
  /^\[\d+\/\d+\]/,
  /downloading/i,
  /^npm\s+(WARN|notice)/i,
  /^audited\s+\d+\s+packages/i,
  /^found\s+\d+\s+vulnerabilities/i,
];

// Patterns that indicate important content
const IMPORTANT_PATTERNS = [
  { pattern: /error/i, category: 'error' },
  { pattern: /failed/i, category: 'error' },
  { pattern: /exception/i, category: 'error' },
  { pattern: /warning/i, category: 'warning' },
  { pattern: /deprecated/i, category: 'warning' },
  { pattern: /success/i, category: 'success' },
  { pattern: /created/i, category: 'success' },
  { pattern: /installed/i, category: 'success' },
  { pattern: /built/i, category: 'success' },
  { pattern: /test.*pass/i, category: 'test' },
  { pattern: /test.*fail/i, category: 'test-fail' },
];

module.exports = {
  name: 'bash-output',

  /**
   * Check if this extractor should handle the content
   */
  matches(content, metadata) {
    // Check for bash/shell patterns
    const shellPatterns = [
      /^\$\s+/m,
      /^>\s+/m,
      /npm\s+(run|install|start|test)/i,
      /git\s+(status|add|commit|push|pull)/i,
      /node\s+/,
      /Error:/i,
      /at\s+\w+\s+\(/,  // Stack trace
    ];

    return shellPatterns.some(p => p.test(content));
  },

  /**
   * Extract meaningful information from bash output
   */
  async extract(content, context) {
    const messages = [];
    const lines = content.split('\n');

    // Track current command and its output
    let currentCommand = null;
    let commandOutput = [];
    let importantLines = [];

    for (const line of lines) {
      // Check for command prompt
      const commandMatch = line.match(/^\$\s+(.+)$/);
      if (commandMatch) {
        // Process previous command
        if (currentCommand && importantLines.length > 0) {
          messages.push(this.createMessage(currentCommand, importantLines));
        }

        currentCommand = commandMatch[1];
        commandOutput = [];
        importantLines = [];
        continue;
      }

      // Skip noise
      if (this.isNoise(line)) continue;

      commandOutput.push(line);

      // Check for important content
      const importance = this.getImportance(line);
      if (importance) {
        importantLines.push({ line, ...importance });
      }
    }

    // Process last command
    if (currentCommand && importantLines.length > 0) {
      messages.push(this.createMessage(currentCommand, importantLines));
    }

    // If no commands found but there's important content
    if (messages.length === 0) {
      const allImportant = lines
        .filter(l => !this.isNoise(l))
        .map(l => ({ line: l, ...this.getImportance(l) }))
        .filter(item => item.category);

      if (allImportant.length > 0) {
        const hasErrors = allImportant.some(i => i.category === 'error' || i.category === 'test-fail');
        messages.push({
          role: 'system',
          content: this.summarizeOutput(allImportant, hasErrors ? 'error' : 'info')
        });
      }
    }

    logger.info('Bash extraction complete', {
      messageCount: messages.length,
      sessionId: context.sessionId
    });

    return {
      messages,
      metadata: {
        extractor: 'bash-output',
        timestamp: Date.now()
      }
    };
  },

  /**
   * Check if a line is noise
   */
  isNoise(line) {
    return NOISE_PATTERNS.some(p => p.test(line));
  },

  /**
   * Get importance level of a line
   */
  getImportance(line) {
    for (const { pattern, category } of IMPORTANT_PATTERNS) {
      if (pattern.test(line)) {
        return { category, priority: category.includes('error') ? 2 : 1 };
      }
    }
    return null;
  },

  /**
   * Create a message from command and important output
   */
  createMessage(command, importantLines) {
    const hasErrors = importantLines.some(i => i.category === 'error' || i.category === 'test-fail');
    const prefix = hasErrors ? '[ERROR]' : '[INFO]';

    let content = `${prefix} Command: ${command}\n`;
    content += importantLines
      .slice(0, 10) // Limit to 10 most important lines
      .map(i => `  ${i.line}`)
      .join('\n');

    return {
      role: 'system',
      content
    };
  },

  /**
   * Summarize output without a specific command
   */
  summarizeOutput(items, type) {
    const prefix = type === 'error' ? '[ERROR]' : '[INFO]';
    return `${prefix} Terminal output:\n${items.slice(0, 10).map(i => `  ${i.line}`).join('\n')}`;
  }
};
