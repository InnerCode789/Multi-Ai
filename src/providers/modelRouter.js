import config from '../config/env.js';
import { GroqProvider } from './groqProvider.js';
import { createGitHubModelsProvider, OpenAICompatProvider } from './openaiProvider.js';
import { GeminiProvider } from './geminiProvider.js';
import { OllamaProvider } from './ollamaProvider.js';
import logger from '../utils/logger.js';

export class ModelRouter {
  constructor() {
    this.providers = new Map();
    this.isLocalOnly = config.aiMode === 'local';
    
    if (this.isLocalOnly) {
      this.agentRouting = {
        planner: { provider: 'ollama', model: config.ollama.model },
        engineer: { provider: 'ollama', model: config.ollama.model },
        reviewer: { provider: 'ollama', model: config.ollama.model },
        qa: { provider: 'ollama', model: config.ollama.model }
      };
    } else {
      this.agentRouting = {
        planner: { provider: config.agents?.planner?.provider || 'gemini', model: config.agents?.planner?.model || config.gemini.model },
        engineer: { provider: config.agents?.engineer?.provider || 'groq', model: config.agents?.engineer?.model || config.groq.model },
        reviewer: { provider: config.agents?.reviewer?.provider || 'gemini', model: config.agents?.reviewer?.model || config.gemini.model },
        qa: { provider: config.agents?.qa?.provider || 'gemini', model: config.agents?.qa?.model || config.gemini.model }
      };
    }

    this.initProviders();
  }

  initProviders() {
    if (this.isLocalOnly) {
      // In LOCAL-ONLY mode: Register ONLY Ollama. Disable all cloud providers.
      const localOllama = new OllamaProvider(config.ollama?.baseUrl || 'http://localhost:11434', config.ollama?.model || 'deepseek-r1:7b');
      this.providers.set('ollama', localOllama);
      logger.info(`[ModelRouter] LOCAL-ONLY Mode active (AI_MODE=local). Registered local Ollama [${config.ollama?.model}] at [${config.ollama?.baseUrl}]. Cloud providers disabled.`);
      return;
    }

    // Hybrid / Cloud modes
    if (config.gemini?.apiKey) {
      this.providers.set('gemini', new GeminiProvider(config.gemini.apiKey, config.gemini.model));
      logger.info(`Provider [Gemini] registered with model [${config.gemini.model}]`);
    }
    if (config.groq?.apiKey) {
      this.providers.set('groq', new GroqProvider(config.groq.apiKey, config.groq.model));
      logger.info(`Provider [Groq] registered with model [${config.groq.model}]`);
    }
    if (config.githubModels?.token) {
      this.providers.set('github-models', createGitHubModelsProvider(config.githubModels.token, config.githubModels.model, config.githubModels.endpoint));
      logger.info(`Provider [GitHubModels] registered with model [${config.githubModels.model}]`);
    }
    if (config.ollama?.baseUrl) {
      this.providers.set('ollama', new OllamaProvider(config.ollama.baseUrl, config.ollama.model));
      logger.info(`Provider [Ollama] registered with model [${config.ollama.model}] at [${config.ollama.baseUrl}]`);
    }
  }

  async verifyLocalProvider() {
    const baseUrl = config.ollama?.baseUrl || 'http://localhost:11434';
    const targetModel = config.ollama?.model || 'deepseek-r1:7b';

    try {
      const res = await fetch(`${baseUrl.replace(/\/$/, '')}/api/tags`);
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      }
      const data = await res.json();
      const models = data.models || [];
      const hasModel = models.some(m => m.name === targetModel || m.model === targetModel);

      if (!hasModel) {
        const available = models.map(m => m.name).join(', ');
        throw new Error(`Target model [${targetModel}] not found in local Ollama. Installed models: [${available || 'none'}]. Run 'ollama pull ${targetModel}' to install.`);
      }

      logger.info(`[ModelRouter] Local Ollama verified successfully. Model [${targetModel}] is ready at ${baseUrl}.`);
      return { ok: true, model: targetModel, baseUrl };
    } catch (err) {
      const errorMsg = `Local Ollama verification failed: ${err.message}. Ensure Ollama is running at ${baseUrl}.`;
      logger.error(`[ModelRouter] ${errorMsg}`);
      throw new Error(errorMsg);
    }
  }

  setRouting(agentRole, providerName, modelId = null) {
    if (this.isLocalOnly && providerName !== 'ollama') {
      logger.warn(`[ModelRouter] System is in LOCAL-ONLY mode. Ignoring request to route [${agentRole}] to cloud provider [${providerName}].`);
      return;
    }

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
    if (this.isLocalOnly) {
      const ollama = this.providers.get('ollama');
      if (!ollama) {
        throw new Error(`Local Ollama provider is not initialized. Please verify Ollama is running at ${config.ollama?.baseUrl}`);
      }
      return {
        provider: ollama,
        providerName: 'ollama',
        isFallback: false
      };
    }

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
      const fallbackOllama = new OllamaProvider(config.ollama?.baseUrl || 'http://localhost:11434', config.ollama?.model || 'deepseek-r1:7b');
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
    const { provider, isFallback } = this.getProviderForAgent(agentRole);
    logger.info(`Agent [${agentRole}] calling Model [${provider.getName()}:${provider.getModelId()}] ${isFallback ? '(FALLBACK)' : ''}`);
    return await provider.generate({ systemPrompt, userPrompt, temperature, maxTokens });
  }

  async *streamForAgent(agentRole, { systemPrompt, userPrompt, temperature, maxTokens }) {
    const { provider, isFallback } = this.getProviderForAgent(agentRole);
    logger.info(`Agent [${agentRole}] streaming from Model [${provider.getName()}:${provider.getModelId()}] ${isFallback ? '(FALLBACK)' : ''}`);
    yield* provider.stream({ systemPrompt, userPrompt, temperature, maxTokens });
  }

  async generateStructuredForAgent(agentRole, { systemPrompt, userPrompt, schema, temperature, maxTokens }) {
    const { provider, isFallback } = this.getProviderForAgent(agentRole);
    logger.info(`Agent [${agentRole}] requesting structured JSON from Model [${provider.getName()}:${provider.getModelId()}] ${isFallback ? '(FALLBACK)' : ''}`);
    return await provider.generateStructured({ systemPrompt, userPrompt, schema, temperature, maxTokens });
  }
}

export const modelRouter = new ModelRouter();
export default modelRouter;
