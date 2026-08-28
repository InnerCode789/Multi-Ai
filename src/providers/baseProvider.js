import { extractJsonFromText } from '../utils/jsonParser.js';

export default class BaseProvider {
  constructor(name, modelId) {
    if (new.target === BaseProvider) {
      throw new TypeError('Cannot construct BaseProvider instances directly');
    }
    this.name = name;
    this.modelId = modelId;
  }

  async generate({ systemPrompt, userPrompt, temperature = 0.7, maxTokens = 4096 }) {
    throw new Error('Method generate() must be implemented.');
  }

  async *stream({ systemPrompt, userPrompt, temperature = 0.7, maxTokens = 4096 }) {
    throw new Error('Method stream() must be implemented.');
  }

  async generateStructured({ systemPrompt, userPrompt, schema = null, temperature = 0.1, maxTokens = 4096 }) {
    let structuredPrompt = userPrompt;
    if (schema) {
      structuredPrompt += `\n\nCRITICAL INSTRUCTION: You MUST output ONLY valid JSON matching this schema:\n${JSON.stringify(schema, null, 2)}\nDo NOT wrap output in any conversational text or explanation. Return valid JSON only.`;
    }

    const response = await this.generate({
      systemPrompt,
      userPrompt: structuredPrompt,
      temperature,
      maxTokens
    });

    const rawText = response.text || '';
    const parsed = extractJsonFromText(rawText);

    if (parsed !== null && typeof parsed === 'object') {
      return {
        ...response,
        structured: parsed
      };
    }

    throw new Error(`Failed to parse structured JSON from ${this.name} (${this.modelId}).\nRaw response:\n${rawText.slice(0, 400)}`);
  }

  getName() {
    return this.name;
  }

  getModelId() {
    return this.modelId;
  }
}
