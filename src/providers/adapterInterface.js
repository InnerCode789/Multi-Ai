export default class AIProvider {
  constructor(name) {
    if (new.target === AIProvider) {
      throw new TypeError("Cannot construct Abstract instances directly");
    }
    this.name = name;
  }

  async generate(prompt, options) {
    throw new Error("Method 'generate' must be implemented.");
  }

  async *stream(prompt, options) {
    throw new Error("Method 'stream' must be implemented.");
  }

  getName() {
    return this.name;
  }
}
