/**
 * Chad Routes - Main route aggregator
 */

const express = require('express');
const cors = require('cors');

const healthRoutes = require('./health');
const sessionsRoutes = require('./sessions');
const chatRoutes = require('./chat');

const app = express();
app.use(cors());
app.use(express.json());

// Mount routes
app.use('/', healthRoutes);
app.use('/api', sessionsRoutes);
app.use('/api', chatRoutes);

module.exports = app;
