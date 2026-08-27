import config from '../config/env.js';
import { GroqProvider } from './groqProvider.js';
import { createGitHubModelsProvider, OpenAICompatProvider } from './openaiProvider.js';
import { GeminiProvider } from './geminiProvider.js';
import { OllamaProvider } from './ollamaProvider.js';
import logger from '../utils/logger.js';

export class ModelRouter {
  constructor() {
    this.providers = new Map();
    this.agentRouting = {
      planner: { provider: config.agents?.planner?.provider || 'gemini', model: config.agents?.planner?.model || config.gemini.model },
      engineer: { provider: config.agents?.engineer?.provider || 'groq', model: config.agents?.engineer?.model || config.groq.model },
      reviewer: { provider: config.agents?.reviewer?.provider || 'github-models', model: config.agents?.reviewer?.model || config.githubModels.model },
      qa: { provider: config.agents?.qa?.provider || 'gemini', model: config.agents?.qa?.model || config.gemini.model }
    };
    this.initProviders();
  }

  initProviders() {
    if (config.gemini?.apiKey) {
      this.providers.set('gemini', new GeminiProvider(config.gemini.apiKey, config.gemini.model));
    }
    if (config.groq?.apiKey) {
      this.providers.set('groq', new GroqProvider(config.groq.apiKey, config.groq.model));
    }
    if (config.githubModels?.token) {
      this.providers.set('github-models', createGitHubModelsProvider(config.githubModels.token, config.githubModels.model, config.githubModels.endpoint));
    }
    if (config.ollama?.baseUrl) {
      this.providers.set('ollama', new OllamaProvider(config.ollama.baseUrl, config.ollama.model));
    }
  }

  setRouting(agentRole, providerName, modelId = null) {
    if (!this.agentRouting[agentRole]) {
      this.agentRouting[agentRole] = {};
    }
    this.agentRouting[agentRole].provider = providerName;
    if (modelId) {
      this.agentRouting[agentRole].model = modelId;
    }
    logger.info(`Routing for [${agentRole}] updated to [${providerName}] (${modelId || 'default'})`);
  }

  getAvailableProviders() {
    return Array.from(this.providers.keys());
  }

  getProviderForAgent(agentRole) {
    const route = this.agentRouting[agentRole] || { provider: 'gemini' };
    const preferredProviderName = route.provider;

    // Check if preferred provider is instantiated
    if (this.providers.has(preferredProviderName)) {
      return {
        provider: this.providers.get(preferredProviderName),
        providerName: preferredProviderName,
        isFallback: false
      };
    }

    // Fallback: pick any available provider
    const available = Array.from(this.providers.keys());
    if (available.length === 0) {
      // Create fallback Ollama or Mock provider
      const fallbackOllama = new OllamaProvider(config.ollama?.baseUrl || 'http://localhost:11434', 'llama3.2:3b');
      return {
        provider: fallbackOllama,
        providerName: 'ollama (fallback)',
        isFallback: true
      };
    }

    const fallbackName = available[0];
    logger.warn(`Preferred provider [${preferredProviderName}] for agent [${agentRole}] is not available. Routing to [${fallbackName}].`);
    return {
      provider: this.providers.get(fallbackName),
      providerName: fallbackName,
      isFallback: true
    };
  }

  async generateForAgent(agentRole, { systemPrompt, userPrompt, temperature, maxTokens }) {
    const { provider, providerName, isFallback } = this.getProviderForAgent(agentRole);
    logger.info(`Agent [${agentRole}] calling Model [${provider.getName()}:${provider.getModelId()}] ${isFallback ? '(FALLBACK)' : ''}`);
    return await provider.generate({ systemPrompt, userPrompt, temperature, maxTokens });
  }

  async *streamForAgent(agentRole, { systemPrompt, userPrompt, temperature, maxTokens }) {
    const { provider, providerName, isFallback } = this.getProviderForAgent(agentRole);
    logger.info(`Agent [${agentRole}] streaming from Model [${provider.getName()}:${provider.getModelId()}] ${isFallback ? '(FALLBACK)' : ''}`);
    yield* provider.stream({ systemPrompt, userPrompt, temperature, maxTokens });
  }

  async generateStructuredForAgent(agentRole, { systemPrompt, userPrompt, schema, temperature, maxTokens }) {
    const { provider, providerName, isFallback } = this.getProviderForAgent(agentRole);
    logger.info(`Agent [${agentRole}] requesting structured JSON from Model [${provider.getName()}:${provider.getModelId()}]`);
    return await provider.generateStructured({ systemPrompt, userPrompt, schema, temperature, maxTokens });
  }
}

export const modelRouter = new ModelRouter();
export default modelRouter;
