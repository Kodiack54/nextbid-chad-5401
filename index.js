/**
 * Chad - AI Transcriber
 * Port 5401
 *
 * Captures Claude Code terminal conversations from 3 sources.
 * Dumps raw content to dev_ai_sessions every 15 min for Jen to process.
 */

require('dotenv').config();
const { Logger } = require('./src/lib/logger');

const logger = new Logger('Chad');

async function start() {
  logger.info('Starting Chad Transcriber...');

  // 1. Load and validate config
  const config = require('./src/lib/config');
  logger.info('Config loaded', {
    port: config.PORT,
    susanUrl: config.SUSAN_URL
  });

  // 2. Initialize session manager
  const sessionManager = require('./src/services/sessionManager');
  await sessionManager.initialize();
  logger.info('Session manager initialized');

  // 3. Start HTTP server
  const app = require('./src/routes');
  const server = app.listen(config.PORT, () => {
    logger.info(`Chad HTTP server listening on port ${config.PORT}`);
  });

  // 4. Attach WebSocket handler
  const wsHandler = require('./src/websocket/handler');
  wsHandler.attach(server);
  logger.info('WebSocket handler attached');

  // 5. Start source watcher (monitors 3 sources, dumps every 15 min)
  const sourceWatcher = require('./src/services/sourceWatcher');
  await sourceWatcher.initialize();
  logger.info('Source watcher initialized');

  // Ready
  logger.info('Chad Transcriber ready', {
    port: config.PORT,
    pid: process.pid
  });

  // Graceful shutdown
  process.on('SIGTERM', async () => {
    logger.info('SIGTERM received, shutting down...');

    const sessions = sessionManager.getAllSessions();
    for (const session of sessions) {
      await session.endSession();
    }

    server.close(() => {
      logger.info('Chad shutdown complete');
      process.exit(0);
    });
  });

  process.on('SIGINT', async () => {
    logger.info('SIGINT received, shutting down...');

    const sessions = sessionManager.getAllSessions();
    for (const session of sessions) {
      await session.endSession();
    }

    server.close(() => {
      logger.info('Chad shutdown complete');
      process.exit(0);
    });
  });
}

// Handle uncaught errors
process.on('uncaughtException', (err) => {
  logger.error('Uncaught exception', { error: err.message, stack: err.stack });
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled rejection', { reason: String(reason) });
});

// Start Chad
start().catch(err => {
  logger.error('Startup failed', { error: err.message, stack: err.stack });
  process.exit(1);
});
