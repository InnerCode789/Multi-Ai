import { getCloudProvider } from './cloudApiProvider.js';
import { getOllamaProvider } from './localOllamaProvider.js';
import { getScraperProvider } from './webScraperProvider.js';
import logger from '../utils/logger.js';
import config from '../config/env.js';

export class ProviderDispatcher {
  constructor() {
    this.circuitBreaker = {
      scraper: {
        failures: 0,
        lastFailure: null,
        isOpen: false
      }
    };
  }

  getProvider(mode, role) {
    switch (mode) {
      case 'cloud':
        return getCloudProvider(role);
      case 'local':
        return getOllamaProvider(role);
      case 'scraper':
        if (this.circuitBreaker.scraper.isOpen) {
          const now = Date.now();
          // Reset circuit after 5 minutes
          if (now - this.circuitBreaker.scraper.lastFailure > 5 * 60 * 1000) {
            this.circuitBreaker.scraper.isOpen = false;
            this.circuitBreaker.scraper.failures = 0;
            return getScraperProvider(role);
          } else {
            throw new Error('Circuit breaker is open for scraper mode.');
          }
        }
        return getScraperProvider(role);
      default:
        throw new Error(`Unknown provider mode: ${mode}`);
    }
  }

  async executeWithFailover(mode, role, prompt, options = {}) {
    let currentMode = mode;
    let provider;
    
    try {
      provider = this.getProvider(currentMode, role);
      const result = await provider.generate(prompt, options);
      
      // On success, reset scraper circuit breaker if it was scraper mode
      if (currentMode === 'scraper') {
        this.circuitBreaker.scraper.failures = 0;
      }
      
      return { provider: provider.getName(), result, failedOver: false };
    } catch (error) {
      if (currentMode === 'scraper' && config.failover) {
        logger.failover(`Scraper failed: ${error.message}. Attempting failover to cloud.`);
        
        this.circuitBreaker.scraper.failures++;
        this.circuitBreaker.scraper.lastFailure = Date.now();
        
        if (this.circuitBreaker.scraper.failures >= 3) {
          this.circuitBreaker.scraper.isOpen = true;
          logger.warn('Circuit breaker opened for scraper mode due to 3 consecutive failures.');
        }

        currentMode = 'cloud';
        provider = this.getProvider(currentMode, role);
        const result = await provider.generate(prompt, options);
        return { provider: provider.getName(), result, failedOver: true };
      }
      
      throw error;
    }
  }

  async *streamWithFailover(mode, role, prompt, options = {}) {
    let currentMode = mode;
    let provider;
    
    try {
      provider = this.getProvider(currentMode, role);
      const stream = provider.stream(prompt, options);
      
      for await (const chunk of stream) {
        yield { ...chunk, provider: provider.getName(), failedOver: false };
      }
      
      if (currentMode === 'scraper') {
        this.circuitBreaker.scraper.failures = 0;
      }
    } catch (error) {
      if (currentMode === 'scraper' && config.failover) {
        logger.failover(`Scraper failed during stream: ${error.message}. Attempting failover to cloud.`);
        
        this.circuitBreaker.scraper.failures++;
        this.circuitBreaker.scraper.lastFailure = Date.now();
        
        if (this.circuitBreaker.scraper.failures >= 3) {
          this.circuitBreaker.scraper.isOpen = true;
          logger.warn('Circuit breaker opened for scraper mode due to 3 consecutive failures.');
        }

        currentMode = 'cloud';
        provider = this.getProvider(currentMode, role);
        
        yield { event: 'failover_notice', message: 'Switched to cloud mode', failedOver: true };
        
        const stream = provider.stream(prompt, options);
        for await (const chunk of stream) {
          yield { ...chunk, provider: provider.getName(), failedOver: true };
        }
        return;
      }
      
      throw error;
    }
  }

  getStatus() {
    return {
      mode: config.mode,
      circuitBreaker: this.circuitBreaker,
      availableProviders: ['cloud', 'local', 'scraper']
    };
  }
}

const dispatcherInstance = new ProviderDispatcher();
export default dispatcherInstance;
