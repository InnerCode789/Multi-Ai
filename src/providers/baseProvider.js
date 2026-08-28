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

  async generateStructured({ systemPrompt, userPrompt, schema = null, temperature = 0.2, maxTokens = 4096 }) {
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

    let text = response.text || '';
    
    // Strip reasoning / thinking tokens (e.g. <think>...</think> from DeepSeek R1 models)
    text = text.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();

    // Extract JSON from markdown or raw text
    let jsonStr = text.trim();
    const jsonBlockMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    if (jsonBlockMatch) {
      jsonStr = jsonBlockMatch[1].trim();
    } else {
      const firstBrace = text.indexOf('{');
      const lastBrace = text.lastIndexOf('}');
      if (firstBrace !== -1 && lastBrace !== -1) {
        jsonStr = text.substring(firstBrace, lastBrace + 1).trim();
      }
    }

    try {
      const parsed = JSON.parse(jsonStr);
      return {
        ...response,
        structured: parsed
      };
    } catch (err) {
      throw new Error(`Failed to parse structured JSON from ${this.name} (${this.modelId}): ${err.message}\nRaw response: ${text.slice(0, 300)}`);
    }
  }

  getName() {
    return this.name;
  }

  getModelId() {
    return this.modelId;
  }
}
