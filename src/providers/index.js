import { getCloudProvider } from './cloudApiProvider.js';
import { getOllamaProvider } from './localOllamaProvider.js';
import { getScraperProvider } from './webScraperProvider.js';
import logger from '../utils/logger.js';
import config from '../config/env.js';

class ProviderManager {
  constructor() {
    this.consecutiveScraperFailures = 0;
    this.scraperCircuitOpen = false;
    this.MAX_FAILURES = 3;
    this.CIRCUIT_COOLDOWN_MS = 60000;
  }

  recordScraperFailure() {
    this.consecutiveScraperFailures++;
    if (this.consecutiveScraperFailures >= this.MAX_FAILURES && !this.scraperCircuitOpen) {
      this.scraperCircuitOpen = true;
      logger.warn('Scraper circuit breaker OPEN.');
      setTimeout(() => {
        this.scraperCircuitOpen = false;
        this.consecutiveScraperFailures = 0;
        logger.info('Scraper circuit breaker RESET.');
      }, this.CIRCUIT_COOLDOWN_MS);
    }
  }

  async dispatchPrompt({ prompt, agentType, requestedMode = config.mode }) {
    const options = { agentType };

    if (requestedMode === 'hybrid') {
      return this.executeHybrid(prompt, agentType, options);
    }

    return this.executeWithFailover(prompt, agentType, requestedMode, options);
  }

  async executeHybrid(prompt, agentType, options) {
    // 1. Try Scraper
    if (!this.scraperCircuitOpen) {
      try {
        const scraper = getScraperProvider(agentType);
        const result = await scraper.generate(prompt, options);
        this.consecutiveScraperFailures = 0;
        return result;
      } catch (e) {
        this.recordScraperFailure();
        logger.warn(`[WARN] Execution failed on scraper. Falling back to local in hybrid mode...`);
      }
    }

    // 2. Try Local
    try {
      const local = getOllamaProvider(agentType);
      return await local.generate(prompt, options);
    } catch (e) {
      logger.warn(`[WARN] Execution failed on hybrid. Initiating fallback to Cloud API...`);
    }

    // 3. Fallback to Cloud
    const cloud = getCloudProvider(agentType);
    return await cloud.generate(prompt, options);
  }

  async executeWithFailover(prompt, agentType, mode, options) {
    if (mode === 'cloud') {
      const provider = getCloudProvider(agentType);
      return await provider.generate(prompt, options);
    }

    let primaryProvider;
    if (mode === 'local') {
      primaryProvider = getOllamaProvider(agentType);
    } else if (mode === 'scraper') {
      if (this.scraperCircuitOpen) {
        logger.warn(`[WARN] Execution failed on ${mode}. Initiating fallback to Cloud API...`);
        const cloud = getCloudProvider(agentType);
        return await cloud.generate(prompt, options);
      }
      primaryProvider = getScraperProvider(agentType);
    } else {
      primaryProvider = getCloudProvider(agentType);
    }

    try {
      const result = await primaryProvider.generate(prompt, options);
      if (mode === 'scraper') {
        this.consecutiveScraperFailures = 0;
      }
      return result;
    } catch (e) {
      if (mode === 'scraper') {
        this.recordScraperFailure();
      }
      
      if (config.failover) {
        logger.warn(`[WARN] Execution failed on ${mode}. Initiating fallback to Cloud API...`);
        const cloud = getCloudProvider(agentType);
        return await cloud.generate(prompt, options);
      } else {
        throw e;
      }
    }
  }

  async *streamWithFailover({ prompt, agentType, requestedMode = config.mode }) {
    const options = { agentType };

    if (requestedMode === 'hybrid') {
      let yielded = false;
      
      if (!this.scraperCircuitOpen) {
        try {
          const scraper = getScraperProvider(agentType);
          const stream = await scraper.stream(prompt, options);
          for await (const chunk of stream) {
            yielded = true;
            yield chunk;
          }
          this.consecutiveScraperFailures = 0;
          return;
        } catch (e) {
          this.recordScraperFailure();
          if (yielded) throw e;
          logger.warn(`[WARN] Execution failed on scraper. Falling back to local in hybrid mode...`);
        }
      }

      try {
        const local = getOllamaProvider(agentType);
        const stream = await local.stream(prompt, options);
        for await (const chunk of stream) {
          yielded = true;
          yield chunk;
        }
        return;
      } catch (e) {
        if (yielded) throw e;
        logger.warn(`[WARN] Execution failed on hybrid. Initiating fallback to Cloud API...`);
      }

      const cloud = getCloudProvider(agentType);
      const stream = await cloud.stream(prompt, options);
      for await (const chunk of stream) {
        yield chunk;
      }
      return;
    }

    if (requestedMode === 'cloud') {
      const provider = getCloudProvider(agentType);
      const stream = await provider.stream(prompt, options);
      for await (const chunk of stream) {
        yield chunk;
      }
      return;
    }

    let primaryProvider;
    if (requestedMode === 'local') {
      primaryProvider = getOllamaProvider(agentType);
    } else if (requestedMode === 'scraper') {
      if (this.scraperCircuitOpen) {
        logger.warn(`[WARN] Execution failed on ${requestedMode}. Initiating fallback to Cloud API...`);
        const cloud = getCloudProvider(agentType);
        const stream = await cloud.stream(prompt, options);
        for await (const chunk of stream) {
          yield chunk;
        }
        return;
      }
      primaryProvider = getScraperProvider(agentType);
    } else {
      primaryProvider = getCloudProvider(agentType);
    }

    let yielded = false;
    try {
      const stream = await primaryProvider.stream(prompt, options);
      for await (const chunk of stream) {
        yielded = true;
        yield chunk;
      }
      if (requestedMode === 'scraper') {
        this.consecutiveScraperFailures = 0;
      }
    } catch (e) {
      if (requestedMode === 'scraper') {
        this.recordScraperFailure();
      }
      if (yielded) throw e;

      if (config.failover) {
        logger.warn(`[WARN] Execution failed on ${requestedMode}. Initiating fallback to Cloud API...`);
        const cloud = getCloudProvider(agentType);
        const stream = await cloud.stream(prompt, options);
        for await (const chunk of stream) {
          yield chunk;
        }
      } else {
        throw e;
      }
    }
  }
}

const providerManager = new ProviderManager();

export const dispatchPrompt = (params) => providerManager.dispatchPrompt(params);
export const streamWithFailover = (params) => providerManager.streamWithFailover(params);
export default providerManager;
