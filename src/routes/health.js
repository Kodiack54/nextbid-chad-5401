/**
 * Chad Health Routes
 */

const express = require('express');
const router = express.Router();
const config = require('../lib/config');
const sessionManager = require('../services/sessionManager');

router.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'chad-transcriber',
    port: config.PORT,
    activeSessions: sessionManager.getActiveCount()
  });
});

module.exports = router;
