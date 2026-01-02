/**
 * Chad Logger
 */
class Logger {
  constructor(module) {
    this.module = module;
  }

  _log(level, message, data = {}) {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] [${level}] ${message} | ${JSON.stringify({ module: this.module, ...data })}`);
  }

  info(message, data) { this._log('INFO', message, data); }
  warn(message, data) { this._log('WARN', message, data); }
  error(message, data) { this._log('ERROR', message, data); }
  debug(message, data) { this._log('DEBUG', message, data); }
}

module.exports = { Logger };
