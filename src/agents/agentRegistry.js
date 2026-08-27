import { PlannerAgent } from './plannerAgent.js';
import { EngineerAgent } from './engineerAgent.js';
import { ReviewerAgent } from './reviewerAgent.js';
import { QAAgent } from './qaAgent.js';

export class AgentRegistry {
  constructor() {
    this.agents = new Map();
  }

  getOrCreateAgents(projectState) {
    const key = projectState.goalId;
    if (!this.agents.has(key)) {
      this.agents.set(key, {
        planner: new PlannerAgent(projectState),
        engineer: new EngineerAgent(projectState),
        reviewer: new ReviewerAgent(projectState),
        qa: new QAAgent(projectState)
      });
    }
    return this.agents.get(key);
  }

  cleanup(goalId) {
    this.agents.delete(goalId);
  }
}

export const agentRegistry = new AgentRegistry();
export default agentRegistry;
