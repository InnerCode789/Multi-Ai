import { chromium } from 'playwright-extra';
import stealthPlugin from 'puppeteer-extra-plugin-stealth';
import AIProvider from './adapterInterface.js';
import config from '../config/env.js';
import logger from '../utils/logger.js';

chromium.use(stealthPlugin());

export default class WebScraperProvider extends AIProvider {
  constructor(target) {
    super(`Scraper-${target}`);
    this.target = target;
    this.browser = null;
    this.context = null;
    this.page = null;
    this.initialized = false;
  }

  async initialize() {
    if (this.initialized) return;

    try {
      logger.scraper(`Initializing WebScraperProvider for ${this.target}...`);
      this.context = await chromium.launchPersistentContext(config.scraper.userDataDir, {
        headless: true,
        viewport: { width: 1280, height: 720 },
      });
      this.page = await this.context.newPage();
      this.initialized = true;
    } catch (error) {
      logger.error(`Failed to initialize ScraperProvider: ${error.message}`);
      throw error;
    }
  }

  async generate(prompt) {
    await this.initialize();
    const start = Date.now();

    const targetUrl = this.target === 'chatgpt' ? 'https://chatgpt.com/' : 'https://chat.deepseek.com/';
    
    try {
      await this.page.goto(targetUrl, { waitUntil: 'networkidle' });

      // Cloudflare check
      const cfChallenge = await this.page.$('.cf-browser-verification, #challenge-running, #challenge-stage');
      if (cfChallenge) {
        throw new Error('CLOUDFLARE_BLOCKED');
      }

      const textareaSelector = this.target === 'chatgpt' 
        ? 'textarea[data-id], #prompt-textarea, textarea'
        : 'textarea';
      
      const submitSelector = this.target === 'chatgpt'
        ? 'button[data-testid="send-button"], form button[type="submit"]'
        : 'button[type="submit"], button';
        
      const responseSelector = this.target === 'chatgpt'
        ? '[data-message-author-role="assistant"]'
        : '.ds-markdown';

      await this.page.waitForSelector(textareaSelector, { timeout: config.scraper.timeoutMs });
      await this.page.fill(textareaSelector, prompt);
      
      // Wait a bit for the UI to enable the button
      await this.page.waitForTimeout(500);
      await this.page.click(submitSelector);

      // Wait for response to start streaming
      await this.page.waitForSelector(responseSelector, { timeout: config.scraper.timeoutMs });

      // Wait for streaming to finish via MutationObserver
      const responseText = await this.page.evaluate(async (selector, timeout) => {
        return new Promise((resolve, reject) => {
          let timeoutTimer;
          let idleTimer;
          const targetNode = document.querySelector('body');
          
          if (!targetNode) {
            reject(new Error('Body not found'));
            return;
          }

          const getLatestResponse = () => {
            const elements = document.querySelectorAll(selector);
            return elements.length > 0 ? elements[elements.length - 1].innerText : '';
          };

          const checkDone = () => {
            clearTimeout(idleTimer);
            idleTimer = setTimeout(() => {
              observer.disconnect();
              clearTimeout(timeoutTimer);
              resolve(getLatestResponse());
            }, 3000); // Wait 3s of no DOM mutations
          };

          const observer = new MutationObserver((mutations) => {
            checkDone();
          });
          
          observer.observe(targetNode, { childList: true, subtree: true, characterData: true });
          
          timeoutTimer = setTimeout(() => {
            observer.disconnect();
            clearTimeout(idleTimer);
            resolve(getLatestResponse());
          }, timeout);

          checkDone(); // Start the idle timer
        });
      }, responseSelector, config.scraper.timeoutMs);

      return {
        text: responseText,
        tokens: 0, // Cannot easily determine tokens in UI scraper
        latencyMs: Date.now() - start,
        provider: this.getName()
      };
      
    } catch (error) {
      logger.error(`Scraper error on ${this.target}: ${error.message}`);
      if (error.message.includes('CLOUDFLARE_BLOCKED') || error.message.includes('Timeout')) {
        throw new Error(error.message.includes('CLOUDFLARE_BLOCKED') ? 'CLOUDFLARE_BLOCKED' : 'SCRAPER_TIMEOUT');
      }
      throw error;
    }
  }

  async *stream(prompt) {
    const result = await this.generate(prompt);
    yield { chunk: result.text, done: true };
  }

  async cleanup() {
    if (this.context) {
      await this.context.close();
      this.initialized = false;
    }
  }
}

export function getScraperProvider(role) {
  const target = role === 'referee' ? 'chatgpt' : 'deepseek';
  return new WebScraperProvider(target);
}
