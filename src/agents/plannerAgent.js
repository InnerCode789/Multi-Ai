import { BaseAgent } from './baseAgent.js';
import { PlanSchema } from '../core/schemas.js';
import { modelRouter } from '../providers/modelRouter.js';
import logger from '../utils/logger.js';

export class PlannerAgent extends BaseAgent {
  constructor(projectState) {
    super({
      role: 'planner',
      name: 'System Planner',
      description: 'Decomposes goals into architecture, actionable tasks, dependencies, and verification criteria.',
      systemPrompt: `You are the Lead Systems Planner in an autonomous multi-agent software engineering team.
Your mission: Analyze the user's high-level software goal, define the technical architecture, break the work into ordered dependency-aware tasks, and formulate unambiguous, verifiable acceptance criteria.

You MUST produce clean, production-grade plans. Output ONLY valid JSON matching the required schema.`,
      projectState
    });
  }

  async plan(goalDescription, workspaceDir) {
    logger.info(`[Planner] Creating strategic implementation plan for goal: "${goalDescription}"`);

    const prompt = `Goal to build: "${goalDescription}"
Workspace Directory: "${workspaceDir}"

Analyze this goal and provide:
1. Technical Architecture & Stack Choices
2. Concrete List of Requirements
3. Unambiguous Acceptance Criteria (with unique IDs like "crit_1", "crit_2")
4. Ordered List of Tasks for the Lead Engineer (with priorities 1-10, dependency IDs, clear descriptions)
5. Known Technical Risks

Return a JSON object with this exact structure:
{
  "goalAnalysis": "Detailed architectural rationale and component breakdown",
  "requirements": ["Requirement 1", "Requirement 2"],
  "acceptanceCriteria": [
    { "id": "crit_1", "description": "Specific verifiable requirement 1" },
    { "id": "crit_2", "description": "Specific verifiable requirement 2" }
  ],
  "tasks": [
    {
      "title": "Task Title",
      "description": "Clear step-by-step instructions for the engineer",
      "agentRole": "engineer",
      "priority": 1,
      "dependencies": []
    }
  ],
  "architecture": "High level architecture overview",
  "risks": ["Risk 1"]
}`;

    const response = await modelRouter.generateStructuredForAgent('planner', {
      systemPrompt: this.systemPrompt,
      userPrompt: prompt
    });

    const parsedPlan = PlanSchema.parse(response.structured);
    this.recordMessage('plan', `Implementation Plan Created: ${parsedPlan.tasks.length} tasks, ${parsedPlan.acceptanceCriteria.length} acceptance criteria.`, parsedPlan);
    this.projectState?.emitEvent('plan_created', 'Planner', `Plan created with ${parsedPlan.tasks.length} tasks`, { plan: parsedPlan });

    return parsedPlan;
  }

  async replan(goalDescription, failedCriteria, existingTasks) {
    logger.warn(`[Planner] Replanning due to ${failedCriteria.length} failed acceptance criteria.`);

    const prompt = `Original Goal: "${goalDescription}"

The following Acceptance Criteria FAILED during verification:
${JSON.stringify(failedCriteria, null, 2)}

Current Tasks State:
${JSON.stringify(existingTasks, null, 2)}

Analyze why these criteria failed and generate remedial tasks to fix the implementation and satisfy the missing requirements.

Return a JSON object matching this structure:
{
  "goalAnalysis": "Root cause of failure and remediation strategy",
  "requirements": [],
  "acceptanceCriteria": [],
  "tasks": [
    {
      "title": "Remediation Task Title",
      "description": "Specific fix required for the engineer",
      "agentRole": "engineer",
      "priority": 1,
      "dependencies": []
    }
  ],
  "architecture": "Adjusted architecture if any",
  "risks": []
}`;

    let revisedPlan;
    try {
      const response = await modelRouter.generateStructuredForAgent('planner', {
        systemPrompt: this.systemPrompt,
        userPrompt: prompt
      });
      revisedPlan = PlanSchema.parse(response.structured);
    } catch (err) {
      logger.warn(`[Planner] Replanning JSON parsing fallback: ${err.message}`);
      revisedPlan = {
        goalAnalysis: `Remediation for ${failedCriteria.length} criteria`,
        requirements: [],
        acceptanceCriteria: [],
        tasks: failedCriteria.map((c, i) => ({
          title: `Fix and satisfy criterion: ${c.description.slice(0, 40)}`,
          description: `Address failed criterion: ${c.description}. Error/evidence: ${c.evidence || 'Criterion not met'}`,
          agentRole: 'engineer',
          priority: 1,
          dependencies: []
        })),
        architecture: '',
        risks: []
      };
    }

    this.recordMessage('plan', `Plan Revised for Remediation: ${revisedPlan.tasks.length} new tasks.`, revisedPlan);
    this.projectState?.emitEvent('plan_revised', 'Planner', `Plan revised with ${revisedPlan.tasks.length} remedial tasks`, { plan: revisedPlan });

    return revisedPlan;
  }
}
