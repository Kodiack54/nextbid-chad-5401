/**
 * Chad Terminal Stream Processor
 * Cleans raw terminal output (removes ANSI codes)
 */

const { Logger } = require('../lib/logger');

const logger = new Logger('Chad:TerminalStream');

/**
 * Clean terminal output - remove ANSI codes and control sequences
 */
function cleanTerminalOutput(data) {
  if (!data) return '';

  let clean = data
    // Remove ANSI escape sequences
    .replace(/\x1b\[[0-9;]*[A-Za-z]/g, '')
    // Remove visible escape codes without ESC prefix
    .replace(/\[([0-9;]*[A-Za-z])/g, '')
    // Remove ANSI color codes
    .replace(/\x1b\[[0-9;]*m/g, '')
    // Remove cursor control sequences
    .replace(/\x1b\[\?[0-9;]*[a-zA-Z]/g, '')
    // Remove OSC sequences
    .replace(/\x1b\][^\x07]*\x07/g, '')
    // Remove remaining escape characters
    .replace(/\x1b/g, '')
    // Remove carriage returns (keep newlines)
    .replace(/\r(?!\n)/g, '')
    // Normalize line endings
    .replace(/\r\n/g, '\n')
    // Remove null bytes
    .replace(/\x00/g, '')
    // Collapse multiple blank lines
    .replace(/\n{3,}/g, '\n\n')
    // Remove lines that are just separators
    .replace(/^[─━─\-_═]+$/gm, '');

  return clean.trim();
}

/**
 * Process terminal output for a session
 */
async function process(session, rawData) {
  const cleanData = cleanTerminalOutput(rawData);
  if (!cleanData) return;

  // Just append to session - no extraction here
  session.appendOutput(cleanData);
}

/**
 * Get stats (minimal now)
 */
function getStats() {
  return { message: 'Terminal stream processing active' };
}

module.exports = {
  process,
  cleanTerminalOutput,
  getStats
};
