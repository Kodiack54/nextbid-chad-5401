/**
 * Chad's Logger - Standalone logging utility
 * Adapted from nextbid-dev-5101/shared/logger.js
 */

const fs = require('fs');
const path = require('path');

const logsDir = path.join(__dirname, '..', '..', 'logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

// Configuration
const MAX_LOG_SIZE_MB = 50;
const MAX_LOG_FILES = 7;
const STORAGE_ALERT_THRESHOLD_GB = 1;
const STORAGE_CHECK_INTERVAL = 60000;

const LEVELS = {
  ERROR: 'ERROR',
  WARN: 'WARN',
  INFO: 'INFO',
  DEBUG: 'DEBUG'
};

let lastStorageAlert = 0;
const STORAGE_ALERT_COOLDOWN = 3600000;

function checkStorageUsage() {
  try {
    const logFiles = fs.readdirSync(logsDir);
    let totalSize = 0;

    for (const file of logFiles) {
      const filePath = path.join(logsDir, file);
      const stats = fs.statSync(filePath);
      totalSize += stats.size;
    }

    const totalSizeGB = totalSize / (1024 * 1024 * 1024);

    if (totalSizeGB > STORAGE_ALERT_THRESHOLD_GB && Date.now() - lastStorageAlert > STORAGE_ALERT_COOLDOWN) {
      lastStorageAlert = Date.now();
      const alertMsg = `[CHAD] STORAGE ALERT: Logs folder is ${totalSizeGB.toFixed(2)}GB!`;
      console.error('\x1b[41m\x1b[37m' + alertMsg + '\x1b[0m');

      const alertFile = path.join(logsDir, 'ALERTS.log');
      fs.appendFileSync(alertFile, `[${new Date().toISOString()}] ${alertMsg}\n`);
    }

    return { totalSizeGB };
  } catch (error) {
    return null;
  }
}

function rotateLogIfNeeded(logFile) {
  try {
    if (!fs.existsSync(logFile)) return;

    const stats = fs.statSync(logFile);
    const sizeMB = stats.size / (1024 * 1024);

    if (sizeMB >= MAX_LOG_SIZE_MB) {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const rotatedFile = logFile.replace('.log', `-${timestamp}.log`);
      fs.renameSync(logFile, rotatedFile);
      cleanupOldLogs();
    }
  } catch (error) {
    // Silently fail
  }
}

function cleanupOldLogs() {
  try {
    const files = fs.readdirSync(logsDir);
    const now = Date.now();
    const maxAge = MAX_LOG_FILES * 24 * 60 * 60 * 1000;

    for (const file of files) {
      if (file === 'ALERTS.log') continue;

      const filePath = path.join(logsDir, file);
      const stats = fs.statSync(filePath);

      if (now - stats.mtime.getTime() > maxAge) {
        fs.unlinkSync(filePath);
      }
    }
  } catch (error) {
    // Silently fail
  }
}

function formatMessage(level, message, meta = {}) {
  const timestamp = new Date().toISOString();
  const metaString = Object.keys(meta).length > 0
    ? ` | ${JSON.stringify(meta)}`
    : '';

  return `[${timestamp}] [${level}] ${message}${metaString}`;
}

function writeToFile(level, message, meta) {
  const logFile = path.join(logsDir, `chad-${new Date().toISOString().split('T')[0]}.log`);
  const formattedMessage = formatMessage(level, message, meta);

  rotateLogIfNeeded(logFile);
  fs.appendFileSync(logFile, formattedMessage + '\n', 'utf8');
}

function logToConsole(level, message, meta) {
  const colors = {
    ERROR: '\x1b[31m',
    WARN: '\x1b[33m',
    INFO: '\x1b[36m',
    DEBUG: '\x1b[90m'
  };
  const reset = '\x1b[0m';

  const color = colors[level] || '';
  const formattedMessage = formatMessage(level, message, meta);

  console.log(`${color}${formattedMessage}${reset}`);
}

class Logger {
  constructor(module = 'Chad') {
    this.module = module;
  }

  log(level, message, meta = {}) {
    const enrichedMeta = { module: this.module, ...meta };

    logToConsole(level, message, enrichedMeta);
    writeToFile(level, message, enrichedMeta);
  }

  error(message, meta) {
    this.log(LEVELS.ERROR, message, meta);
  }

  warn(message, meta) {
    this.log(LEVELS.WARN, message, meta);
  }

  info(message, meta) {
    this.log(LEVELS.INFO, message, meta);
  }

  debug(message, meta) {
    if (process.env.LOG_LEVEL === 'debug') {
      this.log(LEVELS.DEBUG, message, meta);
    }
  }
}

// Start periodic storage check
setInterval(checkStorageUsage, STORAGE_CHECK_INTERVAL);
checkStorageUsage();

module.exports = { Logger, checkStorageUsage };
