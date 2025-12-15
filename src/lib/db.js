/**
 * Chad's Database Client
 * Supabase connection for Chad's operations
 */

const { createClient } = require('@supabase/supabase-js');
const config = require('./config');
const { Logger } = require('./logger');

const logger = new Logger('Chad:DB');

let supabase = null;

function getClient() {
  if (!supabase) {
    if (!config.SUPABASE_URL || !config.SUPABASE_SERVICE_KEY) {
      throw new Error('Supabase credentials not configured');
    }

    supabase = createClient(config.SUPABASE_URL, config.SUPABASE_SERVICE_KEY);
    logger.info('Supabase client initialized');
  }
  return supabase;
}

// Convenience method for table access
function from(table) {
  return getClient().from(table);
}

// Test database connection
async function testConnection() {
  try {
    const { data, error } = await from('dev_ai_sessions')
      .select('id')
      .limit(1);

    if (error) throw error;
    logger.info('Database connection verified');
    return true;
  } catch (error) {
    logger.error('Database connection failed', { error: error.message });
    return false;
  }
}

module.exports = {
  getClient,
  from,
  testConnection
};
