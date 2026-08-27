import OpenAI from 'openai';
import BaseProvider from './baseProvider.js';

export class OpenAICompatProvider extends BaseProvider {
  constructor(name, apiKey, baseURL, modelId = 'gpt-4o-mini') {
    super(name, modelId);
    this.apiKey = apiKey;
    this.baseURL = baseURL;
    this.client = apiKey ? new OpenAI({
      apiKey,
      baseURL: baseURL || undefined
    }) : null;
  }

  async generate({ systemPrompt, userPrompt, temperature = 0.7, maxTokens = 4096 }) {
    if (!this.client) {
      throw new Error(`${this.name} API Key / Token is not configured.`);
    }
    const start = Date.now();
    const messages = [];
    if (systemPrompt) messages.push({ role: 'system', content: systemPrompt });
    messages.push({ role: 'user', content: userPrompt });

    const response = await this.client.chat.completions.create({
      model: this.modelId,
      messages,
      temperature,
      max_tokens: maxTokens
    });

    return {
      text: response.choices[0]?.message?.content || '',
      tokens: response.usage?.total_tokens || 0,
      latencyMs: Date.now() - start,
      provider: this.name,
      modelId: this.modelId
    };
  }

  async *stream({ systemPrompt, userPrompt, temperature = 0.7, maxTokens = 4096 }) {
    if (!this.client) {
      throw new Error(`${this.name} API Key / Token is not configured.`);
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

export function createGitHubModelsProvider(token, model = 'gpt-4o-mini', endpoint = 'https://models.inference.ai.azure.com') {
  return new OpenAICompatProvider('GitHubModels', token, endpoint, model);
}

export function createOpenAIProvider(apiKey, model = 'gpt-4o-mini') {
  return new OpenAICompatProvider('OpenAI', apiKey, null, model);
}
