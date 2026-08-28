import BaseProvider from './baseProvider.js';
import logger from '../utils/logger.js';

export class OllamaProvider extends BaseProvider {
  constructor(baseUrl = 'http://localhost:11434', modelId = 'deepseek-r1:7b') {
    super('Ollama', modelId);
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.resolvedModel = modelId;
  }

  async getValidModel() {
    try {
      const res = await fetch(`${this.baseUrl}/api/tags`);
      if (res.ok) {
        const data = await res.json();
        const models = data.models || [];
        const match = models.find(m => m.name === this.modelId || m.model === this.modelId);
        if (match) {
          this.resolvedModel = match.name;
          return this.resolvedModel;
        }
        if (models.length > 0) {
          logger.warn(`Model [${this.modelId}] not found in Ollama. Auto-selecting installed model [${models[0].name}].`);
          this.resolvedModel = models[0].name;
          return this.resolvedModel;
        }
      }
    } catch {
      // ignore check failure
    }
    return this.modelId;
  }

  async generate({ systemPrompt, userPrompt, temperature = 0.6, maxTokens = 8192 }) {
    const start = Date.now();
    const modelToUse = await this.getValidModel();

    const payload = {
      model: modelToUse,
      prompt: userPrompt,
      system: systemPrompt || undefined,
      stream: false,
      options: {
        temperature,
        num_predict: maxTokens
      }
    };

    const res = await fetch(`${this.baseUrl}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!res.ok) {
      const errBody = await res.text().catch(() => '');
      throw new Error(`Ollama error: HTTP ${res.status} ${res.statusText} - ${errBody}`);
    }

    const data = await res.json();
    return {
      text: data.response || '',
      tokens: data.eval_count || 0,
      latencyMs: Date.now() - start,
      provider: this.name,
      modelId: modelToUse
    };
  }

  async *stream({ systemPrompt, userPrompt, temperature = 0.6, maxTokens = 8192 }) {
    const modelToUse = await this.getValidModel();

    const payload = {
      model: modelToUse,
      prompt: userPrompt,
      system: systemPrompt || undefined,
      stream: true,
      options: {
        temperature,
        num_predict: maxTokens
      }
    };

    const res = await fetch(`${this.baseUrl}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!res.ok) {
      const errBody = await res.text().catch(() => '');
      throw new Error(`Ollama streaming error: HTTP ${res.status} ${res.statusText} - ${errBody}`);
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const json = JSON.parse(line);
          yield { chunk: json.response || '', done: json.done || false, provider: this.name, modelId: modelToUse };
        } catch {
          // ignore corrupted chunk
        }
      }
    }
    yield { chunk: '', done: true, provider: this.name, modelId: modelToUse };
  }

  static async healthCheck(baseUrl = 'http://localhost:11434') {
    try {
      const res = await fetch(`${baseUrl.replace(/\/$/, '')}/api/tags`);
      return res.ok;
    } catch {
      return false;
    }
  }
}
