/**
 * Chad Extractor Registry
 * Plugin discovery and management for terminal output extractors
 */

const fs = require('fs');
const path = require('path');
const { Logger } = require('../lib/logger');

const logger = new Logger('Chad:ExtractorRegistry');

class ExtractorRegistry {
  constructor() {
    this.extractors = new Map();
  }

  /**
   * Discover and load all extractors from the extractors directory
   */
  async discover() {
    const extractorsDir = __dirname;
    const entries = fs.readdirSync(extractorsDir, { withFileTypes: true });

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;

      const configPath = path.join(extractorsDir, entry.name, 'config.json');
      if (!fs.existsSync(configPath)) continue;

      try {
        const config = require(configPath);

        if (!config.enabled) {
          logger.info('Extractor disabled', { name: config.name });
          continue;
        }

        const extractorPath = path.join(extractorsDir, entry.name, config.scripts?.extractor || 'extractor.js');
        if (!fs.existsSync(extractorPath)) {
          logger.warn('Extractor script not found', { name: config.name, path: extractorPath });
          continue;
        }

        const extractor = require(extractorPath);

        this.extractors.set(config.name, {
          config,
          extractor,
          priority: config.priority || 0
        });

        logger.info('Extractor loaded', {
          name: config.name,
          displayName: config.displayName,
          priority: config.priority || 0
        });
      } catch (err) {
        logger.error('Failed to load extractor', {
          directory: entry.name,
          error: err.message
        });
      }
    }

    // Sort by priority (higher first)
    this.sortedExtractors = Array.from(this.extractors.values())
      .sort((a, b) => (b.config.priority || 0) - (a.config.priority || 0));

    logger.info('Extractor discovery complete', { count: this.extractors.size });
  }

  /**
   * Get an extractor by name
   */
  get(name) {
    return this.extractors.get(name);
  }

  /**
   * Find first matching extractor for given content
   */
  findMatching(content, metadata = {}) {
    for (const { extractor, config } of this.sortedExtractors) {
      try {
        if (extractor.matches && extractor.matches(content, metadata)) {
          return extractor;
        }
      } catch (err) {
        logger.error('Extractor match check failed', {
          name: config.name,
          error: err.message
        });
      }
    }
    return null;
  }

  /**
   * Find all matching extractors for given content
   */
  findAllMatching(content, metadata = {}) {
    const matches = [];

    for (const { extractor, config } of this.sortedExtractors) {
      try {
        if (extractor.matches && extractor.matches(content, metadata)) {
          matches.push(extractor);
        }
      } catch (err) {
        logger.error('Extractor match check failed', {
          name: config.name,
          error: err.message
        });
      }
    }

    return matches;
  }

  /**
   * Get count of loaded extractors
   */
  count() {
    return this.extractors.size;
  }

  /**
   * List all loaded extractors
   */
  list() {
    return Array.from(this.extractors.entries()).map(([name, { config }]) => ({
      name,
      displayName: config.displayName,
      enabled: config.enabled,
      priority: config.priority || 0,
      triggers: config.triggers || []
    }));
  }
}

// Export singleton instance
module.exports = new ExtractorRegistry();
