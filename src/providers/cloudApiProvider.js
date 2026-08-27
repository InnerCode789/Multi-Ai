import Groq from 'groq-sdk';
import OpenAI from 'openai';
import { GoogleGenerativeAI } from '@google/generative-ai';
import AIProvider from './adapterInterface.js';
import config from '../config/env.js';

export class GroqProvider extends AIProvider {
  constructor() {
    super('Groq');
    this.client = new Groq({ apiKey: config.groq.apiKey });
    this.model = config.groq.model || 'mixtral-8x7b-32768';
  }

  async generate(prompt, options = {}) {
    const start = Date.now();
    const response = await this.client.chat.completions.create({
      model: this.model,
      messages: [
        { role: 'system', content: 'You are a performance optimization expert.' },
        { role: 'user', content: prompt }
      ],
      temperature: 0.7,
      max_tokens: 4096,
      ...options
    });
    
    return {
      text: response.choices[0]?.message?.content || '',
      tokens: response.usage?.total_tokens || 0,
      latencyMs: Date.now() - start,
      provider: this.getName()
    };
  }

  async *stream(prompt, options = {}) {
    const stream = await this.client.chat.completions.create({
      model: this.model,
      messages: [
        { role: 'system', content: 'You are a performance optimization expert.' },
        { role: 'user', content: prompt }
      ],
      temperature: 0.7,
      max_tokens: 4096,
      stream: true,
      ...options
    });

    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content || '';
      yield { chunk: content, done: false };
    }
    yield { chunk: '', done: true };
  }
}

export class GitHubModelsProvider extends AIProvider {
  constructor() {
    super('GitHubModels');
    this.client = new OpenAI({ 
      apiKey: config.githubModels.token,
      baseURL: config.githubModels.endpoint
    });
    this.model = config.githubModels.model || 'gpt-4o-mini';
  }

  async generate(prompt, options = {}) {
    const start = Date.now();
    const response = await this.client.chat.completions.create({
      model: this.model,
      messages: [
        { role: 'system', content: 'You are a paranoid security auditor.' },
        { role: 'user', content: prompt }
      ],
      temperature: 0.7,
      max_tokens: 4096,
      ...options
    });

    return {
      text: response.choices[0]?.message?.content || '',
      tokens: response.usage?.total_tokens || 0,
      latencyMs: Date.now() - start,
      provider: this.getName()
    };
  }

  async *stream(prompt, options = {}) {
    const stream = await this.client.chat.completions.create({
      model: this.model,
      messages: [
        { role: 'system', content: 'You are a paranoid security auditor.' },
        { role: 'user', content: prompt }
      ],
      temperature: 0.7,
      max_tokens: 4096,
      stream: true,
      ...options
    });

    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content || '';
      yield { chunk: content, done: false };
    }
    yield { chunk: '', done: true };
  }
}

export class GeminiProvider extends AIProvider {
  constructor() {
    super('Gemini');
    this.client = new GoogleGenerativeAI(config.gemini.apiKey);
    this.model = config.gemini.model || 'gemini-1.5-pro';
  }

  async generate(prompt, options = {}) {
    const start = Date.now();
    const model = this.client.getGenerativeModel({
      model: this.model,
      systemInstruction: 'You are a chief software architect and impartial referee.'
    });

    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();

    return {
      text,
      tokens: response.usageMetadata?.totalTokenCount || 0,
      latencyMs: Date.now() - start,
      provider: this.getName()
    };
  }

  async *stream(prompt, options = {}) {
    const model = this.client.getGenerativeModel({
      model: this.model,
      systemInstruction: 'You are a chief software architect and impartial referee.'
    });

    const result = await model.generateContentStream(prompt);

    for await (const chunk of result.stream) {
      const chunkText = chunk.text();
      yield { chunk: chunkText, done: false };
    }
    yield { chunk: '', done: true };
  }
}

export function getCloudProvider(role) {
  if (role === 'performance') return new GroqProvider();
  if (role === 'security') return new GitHubModelsProvider();
  if (role === 'referee') return new GeminiProvider();
  throw new Error(`Unknown role for cloud provider: ${role}`);
}
