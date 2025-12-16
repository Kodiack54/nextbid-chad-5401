/**
 * Chad Catalog Routes - Manual triggers for the cataloger
 */

const express = require('express');
const router = express.Router();
const cataloger = require('../services/cataloger');
const { Logger } = require('../lib/logger');

const logger = new Logger('Chad:CatalogRoutes');

/**
 * POST /api/catalog/trigger - Run catalog cycle now
 */
router.post('/catalog/trigger', async (req, res) => {
  try {
    logger.info('Manual catalog trigger received');
    await cataloger.runCatalog();
    res.json({
      success: true,
      message: 'Catalog cycle completed',
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    logger.error('Manual catalog trigger failed', { error: err.message });
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/catalog/session/:id - Catalog a specific session
 */
router.post('/catalog/session/:id', async (req, res) => {
  try {
    logger.info('Cataloging specific session', { sessionId: req.params.id });
    const result = await cataloger.catalogNow(req.params.id);
    res.json(result);
  } catch (err) {
    logger.error('Session catalog failed', { error: err.message, sessionId: req.params.id });
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/catalog/status - Get cataloger status
 */
router.get('/catalog/status', (req, res) => {
  res.json({
    success: true,
    status: 'running',
    interval: '30 minutes',
    message: 'POST /api/catalog/trigger to run now'
  });
});

module.exports = router;
