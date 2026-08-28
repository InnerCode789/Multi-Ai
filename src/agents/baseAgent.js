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
    const messages = this.projectState.getMessages(10);
    const summary = this.projectState.getSummary();
    const decisions = this.projectState.getDecisions();

    return `=== PROJECT CONTEXT ===
Goal Status: ${summary.status}
Total Tasks: ${summary.totalTasks} (Completed: ${summary.completedTasks})
Files Changed So Far: ${summary.filesChanged.join(', ') || 'None'}

Key Architectural Decisions:
${decisions.map(d => `- [${d.type.toUpperCase()}] ${d.title}: ${d.description} (Status: ${d.status})`).join('\n') || 'None yet'}

Recent Team Messages:
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

  async executeWithTools(task, instructions, maxToolCalls = 12) {
    let iteration = 0;
    const context = this.buildContext(task);
    const availableTools = toolRegistry.getToolsForAgent(this.role);
    const writtenFiles = new Set();

    let conversationHistory = [
      `User Instructions: ${instructions}`,
      `Current Project Context:\n${context}`
    ];

    let lastToolCallSignature = '';
    let duplicateToolCount = 0;

    while (iteration < maxToolCalls) {
      let guidance = '';
      if (duplicateToolCount > 0) {
        guidance = `\n[CRITICAL GUIDANCE]: You already called that tool. Do NOT call it again. If you have finished writing the files, return action: "respond" immediately.`;
      }

      const toolDescriptions = availableTools.map(t => 
        `- ${t.name}: ${t.description} -> Expected args: ${JSON.stringify(t.parameters || {})}`
      ).join('\n');

      const prompt = `${conversationHistory.join('\n\n')}${guidance}

Available Tools (and argument schemas):
${toolDescriptions}

You can decide to either:
1. Call a tool to write or inspect code (e.g. write_file to create code, read_file to inspect).
Format:
{
  "action": "tool_call",
  "tool": "<tool_name>",
  "args": { ... },
  "justification": "Why you are calling this tool"
}

2. Return your final deliverable once work/inspection is finished.
Format:
{
  "action": "respond",
  "summary": "Summary of what was accomplished or observed",
  "deliverable": "Detailed explanation or findings",
  "filesChanged": ["path/to/file.js"],
  "structured": { ... }
}

Choose your next action (return valid JSON only):`;

      const response = await modelRouter.generateStructuredForAgent(this.role, {
        systemPrompt: this.systemPrompt,
        userPrompt: prompt
      });

      const structured = response.structured;

      if (!structured || typeof structured !== 'object') {
        throw new Error(`Agent [${this.name}] did not return a valid structured response object.`);
      }

      const actionRaw = (structured.action || '').toLowerCase().trim();
      const hasTool = structured.tool && typeof structured.tool === 'string';

      // If action is respond or if no valid tool is called but deliverable/summary exists
      if (actionRaw === 'respond' || actionRaw === 'response' || actionRaw === 'complete' || actionRaw === 'finished' || (!hasTool && (structured.summary || structured.deliverable))) {
        const files = Array.from(new Set([...(structured.filesChanged || []), ...Array.from(writtenFiles)]));
        const finalResult = {
          ...structured,
          action: 'respond',
          filesChanged: files
        };
        this.recordMessage('implementation', structured.summary || structured.deliverable || 'Task response provided', finalResult, task?.id);
        return finalResult;
      }

      if (actionRaw === 'tool_call' || actionRaw === 'tool' || hasTool) {
        const tool = structured.tool;
        const args = structured.args || {};
        const justification = structured.justification || '';
        const currentSig = `${tool}:${JSON.stringify(args)}`;

        if (currentSig === lastToolCallSignature) {
          duplicateToolCount++;
          if (duplicateToolCount >= 2) {
            // Force completion if agent is stuck repeating identical tool call
            logger.warn(`[${this.name}] Tool call repetition threshold reached for ${tool}. Advancing.`);
            const files = Array.from(writtenFiles);
            return {
              action: 'respond',
              summary: `Completed task with files: ${files.join(', ') || 'workspace files'}`,
              deliverable: structured.justification || 'Task execution completed',
              filesChanged: files
            };
          }
        } else {
          lastToolCallSignature = currentSig;
          duplicateToolCount = 0;
        }

        logger.info(`[${this.name}] Tool Call -> ${tool}(${JSON.stringify(args)}) - Justification: ${justification || 'N/A'}`);
        this.projectState?.emitEvent('tool_call', this.name, `Executing tool: ${tool}`, { tool, args, justification });
        
        if (tool === 'write_file') {
          const targetFile = args.filePath || args.path || args.file;
          if (targetFile) writtenFiles.add(targetFile);
        }

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

    // If max iterations reached but files were written, return successful deliverable
    if (writtenFiles.size > 0) {
      const files = Array.from(writtenFiles);
      return {
        action: 'respond',
        summary: `Implemented changes across ${files.length} files: ${files.join(', ')}`,
        deliverable: `Task implementation files created: ${files.join(', ')}`,
        filesChanged: files
      };
    }

    throw new Error(`Agent [${this.name}] exceeded maximum tool call depth (${maxToolCalls}).`);
  }
}
