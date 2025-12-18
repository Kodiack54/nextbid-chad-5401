/**
 * Source Watcher Status Routes
 */
const express = require('express');
const router = express.Router();
const sourceWatcher = require('../services/sourceWatcher');

// GET /api/sources/status - Get status of all source watchers
router.get('/status', (req, res) => {
  try {
    const status = sourceWatcher.getStatus();
    res.json({
      success: true,
      sources: status,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/sources/dump/:sourceId - Force a dump for a source
router.post('/dump/:sourceId', async (req, res) => {
  try {
    const sessionId = await sourceWatcher.forceDump(req.params.sourceId);
    res.json({
      success: true,
      sessionId,
      message: sessionId ? 'Dump created' : 'No content to dump'
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
