import { modelRouter } from '../providers/modelRouter.js';
import { toolRegistry } from '../tools/toolRegistry.js';
import logger from '../utils/logger.js';
import { generateId } from '../core/schemas.js';

export class BaseAgent {
  constructor({ role, name, description, systemPrompt, projectState }) {
    this.role = role;
    this.name = name;
    this.description = description;
    this.systemPrompt = systemPrompt;
    this.projectState = projectState;
  }

  buildContext(task) {
    if (!this.projectState) return '';
    const messages = this.projectState.getMessages(15);
    const summary = this.projectState.getSummary();
    const decisions = this.projectState.getDecisions();

    return `=== PROJECT CONTEXT ===
Goal Status: ${summary.status}
Total Tasks: ${summary.totalTasks} (Completed: ${summary.completedTasks})
Files Changed So Far: ${summary.filesChanged.join(', ') || 'None'}

Key Architectural Decisions:
${decisions.map(d => `- [${d.type.toUpperCase()}] ${d.title}: ${d.description} (Status: ${d.status})`).join('\n') || 'None yet'}

Recent Messages:
${messages.map(m => `[${m.fromAgent}] (${m.type}): ${m.content}`).join('\n')}

=== CURRENT TASK ===
${task ? JSON.stringify(task, null, 2) : 'No specific task active'}`;
  }

  recordMessage(type, content, structured = null, taskId = null, toAgent = null) {
    const route = modelRouter.getProviderForAgent(this.role);
    const fromModel = `${route.provider.getName()}:${route.provider.getModelId()}`;

    const message = {
      id: generateId(),
      goalId: this.projectState?.goalId,
      taskId,
      fromAgent: this.name,
      fromModel,
      toAgent,
      type,
      content,
      structured,
      timestamp: new Date().toISOString()
    };
    if (this.projectState) {
      this.projectState.addMessage(message);
    }
    return message;
  }

  async executeWithTools(task, instructions, maxToolCalls = 10) {
    let iteration = 0;
    const context = this.buildContext(task);
    const availableTools = toolRegistry.getToolsForAgent(this.role);

    let conversationHistory = [
      `User Instructions: ${instructions}`,
      `Current Project Context:\n${context}`
    ];

    while (iteration < maxToolCalls) {
      const prompt = `${conversationHistory.join('\n\n')}

Available Tools:
${JSON.stringify(availableTools, null, 2)}

You can decide to either:
1. Call a tool to inspect or modify code/files.
Format:
{
  "action": "tool_call",
  "tool": "<tool_name>",
  "args": { ... },
  "justification": "Why you are calling this tool"
}

2. Return your final response/deliverable.
Format:
{
  "action": "respond",
  "summary": "Summary of what you did",
  "deliverable": "Detailed explanation, code, or findings",
  "filesChanged": ["path/to/file1.js"],
  "structured": { ... }
}

Choose your next action:`;

      const response = await modelRouter.generateStructuredForAgent(this.role, {
        systemPrompt: this.systemPrompt,
        userPrompt: prompt
      });

      const structured = response.structured;

      if (!structured || typeof structured !== 'object') {
        throw new Error(`Agent [${this.name}] did not return a valid structured response object.`);
      }

      if (structured.action === 'respond') {
        this.recordMessage('implementation', structured.summary || structured.deliverable || 'Task response provided', structured, task?.id);
        return structured;
      }

      if (structured.action === 'tool_call') {
        const { tool, args, justification } = structured;
        logger.info(`[${this.name}] Tool Call -> ${tool}(${JSON.stringify(args)}) - Justification: ${justification || 'N/A'}`);
        
        this.projectState?.emitEvent('tool_call', this.name, `Executing tool: ${tool}`, { tool, args, justification });
        
        try {
          const toolResult = await toolRegistry.executeTool(tool, args, this.role);
          conversationHistory.push(`[You called tool ${tool} with args ${JSON.stringify(args)}]\nTool Result:\n${JSON.stringify(toolResult.output)}`);
        } catch (err) {
          logger.warn(`[${this.name}] Tool execution failed: ${err.message}`);
          conversationHistory.push(`[Tool ${tool} execution failed]: ${err.message}`);
        }
      }

      iteration++;
    }

    throw new Error(`Agent [${this.name}] exceeded maximum tool call depth (${maxToolCalls}).`);
  }
}
