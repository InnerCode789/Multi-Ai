import { orchestrator } from '../core/orchestrator.js';
import { setupSSE, sendSSE, startHeartbeat, stopHeartbeat } from '../utils/sseHelper.js';
import logger from '../utils/logger.js';
import { z } from 'zod';

const goalRequestSchema = z.object({
  goal: z.string().min(3, "Goal description must be at least 3 characters"),
  workspaceDir: z.string().optional(),
  maxIterations: z.number().int().min(1).max(20).default(10)
});

export async function handleGoalStream(req, res) {
  setupSSE(res);
  const heartbeat = startHeartbeat(res);
  let activeGoalId = null;

  req.on('close', () => {
    logger.info('Client closed connection to goal stream');
    stopHeartbeat(heartbeat);
    if (activeGoalId) {
      orchestrator.abortGoal(activeGoalId);
    }
  });

  try {
    const parsed = goalRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      sendSSE(res, 'error', { message: 'Invalid goal parameters', errors: parsed.error.errors });
      res.end();
      return;
    }

    const { goal, workspaceDir, maxIterations } = parsed.data;

    sendSSE(res, 'init', {
      status: 'started',
      goal,
      timestamp: new Date().toISOString()
    });

    const result = await orchestrator.runGoal({
      goalDescription: goal,
      workspaceDir,
      maxIterations,
      onEvent: (event) => {
        if (!activeGoalId && event.goalId) {
          activeGoalId = event.goalId;
        }
        sendSSE(res, 'agent_event', event);
      }
    });

    sendSSE(res, 'goal_complete', result);

  } catch (error) {
    logger.error('Goal stream error:', error.message);
    sendSSE(res, 'error', { message: error.message });
  } finally {
    stopHeartbeat(heartbeat);
    if (!res.writableEnded) {
      res.end();
    }
  }
}
