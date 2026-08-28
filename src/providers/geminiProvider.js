import { GoogleGenerativeAI } from '@google/generative-ai';
import BaseProvider from './baseProvider.js';
import logger from '../utils/logger.js';

export class GeminiProvider extends BaseProvider {
  constructor(apiKey, modelId = 'gemini-3.5-flash') {
    super('Gemini', modelId);
    this.apiKey = apiKey;
    this.client = apiKey ? new GoogleGenerativeAI(apiKey) : null;
  }

  async generate({ systemPrompt, userPrompt, temperature = 0.7, maxTokens = 4096 }) {
    if (!this.client) {
      throw new Error('Google Gemini API Key is not configured.');
    }
    const start = Date.now();
    
    // Model fallback sequence for ultra-resilience against momentary 503 load spikes
    const candidateModels = [this.modelId, 'gemini-3.5-flash', 'gemini-3.5-flash-lite', 'gemini-3.6-flash'].filter(
      (m, idx, arr) => arr.indexOf(m) === idx
    );

    let lastError = null;

    for (const modelName of candidateModels) {
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const model = this.client.getGenerativeModel({
            model: modelName,
            systemInstruction: systemPrompt || undefined,
            generationConfig: {
              temperature,
              maxOutputTokens: maxTokens
            }
          });

          const timeoutPromise = new Promise((_, reject) => 
            setTimeout(() => reject(new Error(`Gemini request timed out after 35s for ${modelName}`)), 35000)
          );

          const result = await Promise.race([
            model.generateContent(userPrompt),
            timeoutPromise
          ]);

          const response = await result.response;
          
          let text = '';
          const candidate = response.candidates?.[0];
          if (candidate?.content?.parts) {
            text = candidate.content.parts.map(p => p.text || '').join('');
          } else {
            try { text = response.text() || ''; } catch {}
          }

          if (!text || !text.trim()) {
            throw new Error(`Empty response returned from ${modelName}`);
          }

          return {
            text: text.trim(),
            tokens: response.usageMetadata?.totalTokenCount || 0,
            latencyMs: Date.now() - start,
            provider: this.name,
            modelId: modelName
          };
        } catch (err) {
          lastError = err;
          logger.warn(`Gemini [${modelName}] attempt ${attempt + 1} failed: ${err.message}.`);
          if (attempt === 0) {
            await new Promise(r => setTimeout(r, 1000));
          }
        }
      }
    }

    throw lastError || new Error('All Gemini candidate models failed.');
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
