import Groq from 'groq-sdk';
import BaseProvider from './baseProvider.js';
import logger from '../utils/logger.js';

export class GroqProvider extends BaseProvider {
  constructor(apiKey, modelId = 'qwen/qwen3.8-27b') {
    super('Groq', modelId);
    this.apiKey = apiKey;
    this.client = apiKey ? new Groq({ apiKey }) : null;
  }

  async generate({ systemPrompt, userPrompt, temperature = 0.7, maxTokens = 4096 }) {
    if (!this.client) {
      throw new Error('Groq API Key is not configured.');
    }
    const start = Date.now();
    const messages = [];
    if (systemPrompt) messages.push({ role: 'system', content: systemPrompt });
    messages.push({ role: 'user', content: userPrompt });

    const candidateModels = [this.modelId, 'qwen/qwen3.8-27b', 'openai/gpt-oss-120b', 'qwen/qwen3.6-27b', 'groq/compound'].filter(
      (m, idx, arr) => arr.indexOf(m) === idx
    );

    let lastError = null;

    for (const modelName of candidateModels) {
      try {
        const response = await this.client.chat.completions.create({
          model: modelName,
          messages,
          temperature,
          max_tokens: maxTokens
        });

        return {
          text: response.choices[0]?.message?.content || '',
          tokens: response.usage?.total_tokens || 0,
          latencyMs: Date.now() - start,
          provider: this.name,
          modelId: modelName
        };
      } catch (err) {
        lastError = err;
        logger.warn(`Groq model [${modelName}] failed: ${err.message}. Trying next candidate...`);
      }
    }

    throw lastError || new Error('All Groq candidate models failed.');
  }

  async *stream({ systemPrompt, userPrompt, temperature = 0.7, maxTokens = 4096 }) {
    if (!this.client) {
      throw new Error('Groq API Key is not configured.');
    }
    const messages = [];
    if (systemPrompt) messages.push({ role: 'system', content: systemPrompt });
    messages.push({ role: 'user', content: userPrompt });

    const stream = await this.client.chat.completions.create({
      model: this.modelId,
      messages,
      temperature,
      max_tokens: maxTokens,
      stream: true
    });

    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content || '';
      yield { chunk: content, done: false, provider: this.name, modelId: this.modelId };
    }
    yield { chunk: '', done: true, provider: this.name, modelId: this.modelId };
  }
}
