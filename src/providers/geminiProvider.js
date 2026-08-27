import { GoogleGenerativeAI } from '@google/generative-ai';
import BaseProvider from './baseProvider.js';

export class GeminiProvider extends BaseProvider {
  constructor(apiKey, modelId = 'gemini-2.5-flash') {
    super('Gemini', modelId);
    this.apiKey = apiKey;
    this.client = apiKey ? new GoogleGenerativeAI(apiKey) : null;
  }

  async generate({ systemPrompt, userPrompt, temperature = 0.7, maxTokens = 4096 }) {
    if (!this.client) {
      throw new Error('Google Gemini API Key is not configured.');
    }
    const start = Date.now();
    const model = this.client.getGenerativeModel({
      model: this.modelId,
      systemInstruction: systemPrompt || undefined,
      generationConfig: {
        temperature,
        maxOutputTokens: maxTokens
      }
    });

    const result = await model.generateContent(userPrompt);
    const response = await result.response;
    const text = response.text() || '';

    return {
      text,
      tokens: response.usageMetadata?.totalTokenCount || 0,
      latencyMs: Date.now() - start,
      provider: this.name,
      modelId: this.modelId
    };
  }

  async *stream({ systemPrompt, userPrompt, temperature = 0.7, maxTokens = 4096 }) {
    if (!this.client) {
      throw new Error('Google Gemini API Key is not configured.');
    }
    const model = this.client.getGenerativeModel({
      model: this.modelId,
      systemInstruction: systemPrompt || undefined,
      generationConfig: {
        temperature,
        maxOutputTokens: maxTokens
      }
    });

    const result = await model.generateContentStream(userPrompt);

    for await (const chunk of result.stream) {
      const chunkText = chunk.text();
      yield { chunk: chunkText, done: false, provider: this.name, modelId: this.modelId };
    }
    yield { chunk: '', done: true, provider: this.name, modelId: this.modelId };
  }
}
