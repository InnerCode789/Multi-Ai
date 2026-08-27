import logger from '../utils/logger.js';

class ToolRegistry {
  constructor() {
    this.tools = new Map();
  }

  registerTool(name, description, executeFn, permissions = ['*']) {
    this.tools.set(name, {
      name,
      description,
      execute: executeFn,
      permissions
    });
  }

  getTool(name) {
    return this.tools.get(name);
  }

  listTools() {
    return Array.from(this.tools.values()).map(t => ({
      name: t.name,
      description: t.description
    }));
  }

  async executeTool(name, args, agentRole) {
    const start = Date.now();
    try {
      const tool = this.tools.get(name);
      if (!tool) {
        throw new Error(`Tool not found: ${name}`);
      }

      const hasPermission = tool.permissions.includes('*') || tool.permissions.includes(agentRole);
      if (!hasPermission) {
        throw new Error(`Agent with role [${agentRole}] does not have permission to execute tool [${name}]`);
      }

      const output = await tool.execute(args || {});
      return {
        tool: name,
        success: true,
        output,
        error: null,
        executionTimeMs: Date.now() - start
      };
    } catch (error) {
      logger.error(`Error executing tool ${name}:`, error.message);
      return {
        tool: name,
        success: false,
        output: null,
        error: error.message,
        executionTimeMs: Date.now() - start
      };
    }
  }

  getToolsForAgent(agentRole) {
    return Array.from(this.tools.values())
      .filter(t => t.permissions.includes('*') || t.permissions.includes(agentRole))
      .map(t => ({ name: t.name, description: t.description }));
  }
}

export const toolRegistry = new ToolRegistry();
export default toolRegistry;
