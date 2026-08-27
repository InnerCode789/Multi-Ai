import db from '../db/database.js';
import { modelRouter } from '../providers/modelRouter.js';
import { toolRegistry } from '../tools/toolRegistry.js';
import config from '../config/env.js';

export function getSystemStatus(req, res) {
  const availableProviders = modelRouter.getAvailableProviders();
  const tools = toolRegistry.listTools();
  
  res.json({
    status: 'healthy',
    environment: config.server.nodeEnv,
    providers: {
      available: availableProviders,
      routing: modelRouter.agentRouting
    },
    tools: {
      total: tools.length,
      list: tools
    },
    timestamp: new Date().toISOString()
  });
}

export function listGoals(req, res) {
  const goals = db.listGoals();
  res.json({ goals });
}

export function getGoalDetails(req, res) {
  const { id } = req.params;
  const goal = db.getGoal(id);
  if (!goal) {
    return res.status(404).json({ error: 'Goal not found' });
  }

  const tasks = db.getTasksByGoal(id);
  const messages = db.getMessagesByGoal(id, 200);
  const decisions = db.getDecisionsByGoal(id);
  const events = db.getEventsByGoal(id);

  res.json({
    goal,
    tasks,
    messages,
    decisions,
    events
  });
}
