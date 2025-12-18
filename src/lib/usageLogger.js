/**
 * Chad Usage Logger
 * Logs all AI API usage to dev_ai_usage table
 */

const { from } = require('./db');
const { Logger } = require('./logger');

const logger = new Logger('Chad:UsageLogger');

// System UUID for AI workers (all zeros)
const SYSTEM_USER_ID = '00000000-0000-0000-0000-000000000000';

// Pricing per 1M tokens
const MODEL_PRICING = {
  'gpt-4o-mini': { input: 0.15, output: 0.60 },
  'gpt-4o': { input: 5.0, output: 15.0 },
  'claude-3-5-haiku': { input: 0.80, output: 4.0 },
  'claude-3-5-sonnet': { input: 3.0, output: 15.0 },
};

function calculateCost(model, inputTokens, outputTokens) {
  const modelKey = Object.keys(MODEL_PRICING).find(k => model.includes(k));
  const pricing = modelKey ? MODEL_PRICING[modelKey] : { input: 0.15, output: 0.60 };
  
  const inputCost = (inputTokens / 1_000_000) * pricing.input;
  const outputCost = (outputTokens / 1_000_000) * pricing.output;
  return inputCost + outputCost;
}

/**
 * Log OpenAI usage to database
 */
async function logOpenAIUsage(response, requestType = 'chat', startTime = null) {
  if (!response?.usage) return response;

  try {
    const model = response.model || 'gpt-4o-mini';
    const inputTokens = response.usage.prompt_tokens || 0;
    const outputTokens = response.usage.completion_tokens || 0;
    const costUsd = calculateCost(model, inputTokens, outputTokens);
    const responseTimeMs = startTime ? Date.now() - startTime : null;

    const { error } = await from('dev_ai_usage').insert({
      user_id: SYSTEM_USER_ID,
      project_id: null,
      model,
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      cost_usd: costUsd,
      request_type: requestType,
      assistant_name: 'chad',
      response_time_ms: responseTimeMs
    });

    if (error) {
      logger.error('Failed to log usage', { error: error.message });
    } else {
      logger.info(`Usage logged: ${model} ${inputTokens}+${outputTokens} = $${costUsd.toFixed(6)}`);
    }
  } catch (err) {
    logger.error('Usage logging error', { error: err.message });
  }

  return response;
}

/**
 * Log Anthropic usage to database
 */
async function logAnthropicUsage(response, requestType = 'chat', startTime = null) {
  if (!response?.usage) return response;

  try {
    const model = response.model || 'claude-3-5-haiku';
    const inputTokens = response.usage.input_tokens || 0;
    const outputTokens = response.usage.output_tokens || 0;
    const costUsd = calculateCost(model, inputTokens, outputTokens);
    const responseTimeMs = startTime ? Date.now() - startTime : null;

    const { error } = await from('dev_ai_usage').insert({
      user_id: SYSTEM_USER_ID,
      project_id: null,
      model,
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      cost_usd: costUsd,
      request_type: requestType,
      assistant_name: 'chad',
      response_time_ms: responseTimeMs
    });

    if (error) {
      logger.error('Failed to log usage', { error: error.message });
    } else {
      logger.info(`Usage logged: ${model} ${inputTokens}+${outputTokens} = $${costUsd.toFixed(6)}`);
    }
  } catch (err) {
    logger.error('Usage logging error', { error: err.message });
  }

  return response;
}

module.exports = {
  logOpenAIUsage,
  logAnthropicUsage,
  calculateCost
};
