/**
 * Chad Routes - Main route aggregator
 */

const express = require('express');
const cors = require('cors');

const healthRoutes = require('./health');
const sessionsRoutes = require('./sessions');
const sourcesRoutes = require('./sources');

const app = express();
app.use(cors());
app.use(express.json());

// Mount routes
app.use('/', healthRoutes);
app.use('/api', sessionsRoutes);
app.use('/api/sources', sourcesRoutes);

module.exports = app;
