import AIProvider from './adapterInterface.js';
import config from '../config/env.js';
import logger from '../utils/logger.js';

export default class OllamaProvider extends AIProvider {
  constructor(role) {
    super(`Ollama-${role}`);
    this.role = role;
    this.model = config.ollama.models[role] || 'llama3';
    this.baseUrl = config.ollama.baseUrl;
  }

  async generate(prompt, options = {}) {
    const start = Date.now();
    try {
      const response = await fetch(`${this.baseUrl}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: this.model,
          prompt,
          stream: false,
          ...options
        })
      });

      if (!response.ok) {
        throw new Error(`Ollama error: ${response.statusText}`);
      }

      const data = await response.json();
      return {
        text: data.response || '',
        tokens: data.eval_count || 0,
        latencyMs: Date.now() - start,
        provider: this.getName()
      };
    } catch (error) {
      logger.error(`Ollama generation failed: ${error.message}`);
      throw error;
    }
  }

  async *stream(prompt, options = {}) {
    try {
      const response = await fetch(`${this.baseUrl}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: this.model,
          prompt,
          stream: true,
          ...options
        })
      });

      if (!response.ok) {
        throw new Error(`Ollama streaming error: ${response.statusText}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop(); // Keep the last incomplete line in buffer

        for (const line of lines) {
          if (line.trim() === '') continue;
          try {
            const json = JSON.parse(line);
            yield { chunk: json.response, done: json.done };
          } catch (e) {
            logger.debug(`Failed to parse NDJSON line: ${line}`);
          }
        }
      }
      if (buffer.trim() !== '') {
        try {
          const json = JSON.parse(buffer);
          yield { chunk: json.response, done: json.done };
        } catch (e) {
          // Ignore parse errors on the very last chunk if it's malformed
        }
      }
    } catch (error) {
      logger.error(`Ollama streaming failed: ${error.message}`);
      throw error;
    }
  }

  static async healthCheck() {
    try {
      const response = await fetch(`${config.ollama.baseUrl}/api/tags`);
      return response.ok;
    } catch (error) {
      return false;
    }
  }
}

export function getOllamaProvider(role) {
  if (!['performance', 'security', 'referee'].includes(role)) {
    throw new Error(`Unknown role for local provider: ${role}`);
  }
  return new OllamaProvider(role);
}
