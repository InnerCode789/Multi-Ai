import BaseProvider from './baseProvider.js';

export class OllamaProvider extends BaseProvider {
  constructor(baseUrl = 'http://localhost:11434', modelId = 'llama3.2:3b') {
    super('Ollama', modelId);
    this.baseUrl = baseUrl.replace(/\/$/, '');
  }

  async generate({ systemPrompt, userPrompt, temperature = 0.7, maxTokens = 4096 }) {
    const start = Date.now();
    const payload = {
      model: this.modelId,
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
      throw new Error(`Ollama error: HTTP ${res.status} ${res.statusText}`);
    }

    const data = await res.json();
    return {
      text: data.response || '',
      tokens: data.eval_count || 0,
      latencyMs: Date.now() - start,
      provider: this.name,
      modelId: this.modelId
    };
  }

  async *stream({ systemPrompt, userPrompt, temperature = 0.7, maxTokens = 4096 }) {
    const payload = {
      model: this.modelId,
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
      throw new Error(`Ollama streaming error: HTTP ${res.status} ${res.statusText}`);
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
          yield { chunk: json.response || '', done: json.done || false, provider: this.name, modelId: this.modelId };
        } catch (e) {
          // ignore corrupted chunk
        }
      }
    }
    yield { chunk: '', done: true, provider: this.name, modelId: this.modelId };
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
