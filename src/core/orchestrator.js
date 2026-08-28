import path from 'path';
import fs from 'fs';
import { ProjectState } from './projectState.js';
import { TaskQueue } from './taskQueue.js';
import { agentRegistry } from '../agents/agentRegistry.js';
import { setupFileTools } from '../tools/fileTools.js';
import { setupTerminalTools } from '../tools/terminalTools.js';
import { generateId, GoalSchema } from './schemas.js';
import { modelRouter } from '../providers/modelRouter.js';
import db from '../db/database.js';
import logger from '../utils/logger.js';
import config from '../config/env.js';

export class Orchestrator {
  constructor() {
    this.activeRuns = new Map();
  }

  // Canonical dependency normalization helper
  normalizeTasks(rawTasks, goalId) {
    // 1. Assign unique UUIDs to each task upfront
    const tasksWithId = rawTasks.map((t, idx) => ({
      id: generateId(),
      goalId,
      title: t.title || `Task ${idx + 1}`,
      description: t.description || '',
      status: 'pending',
      assignedAgent: 'engineer', // Normalize to engineer (the executor agent with tool privileges)
      priority: t.priority || (idx + 1),
      rawDependencies: t.dependencies || [],
      attempts: 0,
      maxAttempts: 3
    }));

    // 2. Build lookup map from indices, titles, and keys to task UUID
    const lookupMap = new Map();
    tasksWithId.forEach((task, idx) => {
      lookupMap.set(String(idx), task.id);
      lookupMap.set(String(idx + 1), task.id);
      lookupMap.set(`task_${idx + 1}`, task.id);
      lookupMap.set(`task ${idx + 1}`, task.id);
      lookupMap.set(task.title.toLowerCase().trim(), task.id);
    });

    // 3. Resolve dependencies to canonical UUIDs
    return tasksWithId.map((task) => {
      const canonicalDeps = new Set();

      for (const dep of task.rawDependencies) {
        const depStr = String(dep).toLowerCase().trim();
        if (lookupMap.has(depStr)) {
          const targetId = lookupMap.get(depStr);
          if (targetId !== task.id) {
            canonicalDeps.add(targetId);
          }
        } else {
          // Attempt substring match on task titles
          const match = tasksWithId.find(t => 
            t.id !== task.id && (
              t.title.toLowerCase().includes(depStr) || 
              depStr.includes(t.title.toLowerCase())
            )
          );
          if (match) {
            canonicalDeps.add(match.id);
          } else {
            logger.info(`[Orchestrator] Dropping unresolvable dependency reference: "${dep}" for task "${task.title}"`);
          }
        }
      }

      const { rawDependencies, ...cleanTask } = task;
      return {
        ...cleanTask,
        dependencies: Array.from(canonicalDeps)
      };
    });
  }

  async runGoal({ goalDescription, workspaceDir = null, maxIterations = 10, onEvent = null }) {
    const goalId = generateId();

    // Verify Ollama in LOCAL-ONLY mode
    if (config.aiMode === 'local') {
      await modelRouter.verifyLocalProvider();
    }
    
    // Setup workspace directory
    const resolvedWorkspace = workspaceDir 
      ? path.resolve(workspaceDir)
      : path.resolve(config.system.workspaceBaseDir || './workspaces', `goal_${goalId.slice(0, 8)}`);

    if (!fs.existsSync(resolvedWorkspace)) {
      fs.mkdirSync(resolvedWorkspace, { recursive: true });
    }

    // Register sandboxed tools for this workspace
    setupFileTools(resolvedWorkspace);
    setupTerminalTools(resolvedWorkspace);

    // Initialize Project State and Task Queue
    const projectState = new ProjectState(goalId);
    const taskQueue = new TaskQueue(projectState);

    // Hook event listener
    if (onEvent) {
      projectState.on('event', onEvent);
    }

    // Save initial goal record
    const goal = {
      id: goalId,
      description: goalDescription,
      status: 'planning',
      requirements: [],
      acceptanceCriteria: [],
      iteration: 0,
      maxIterations,
      workspaceDir: resolvedWorkspace,
      createdAt: new Date().toISOString()
    };
    db.saveGoal(goal);
    projectState.emitEvent('goal_started', 'System', `Autonomous Goal Initiated: "${goalDescription}"`, { goal });

    this.activeRuns.set(goalId, { projectState, taskQueue, aborted: false });

    try {
      const agents = agentRegistry.getOrCreateAgents(projectState);
      const { planner, engineer, reviewer, qa } = agents;

      // ==========================================
      // STAGE 1: PLANNING
      // ==========================================
      projectState.updateGoalStatus('planning');
      projectState.emitEvent('stage_started', 'Planner', 'Stage 1: Technical Analysis and Work Breakdown');

      const plan = await planner.plan(goalDescription, resolvedWorkspace);

      // Save plan to goal
      const currentGoal = projectState.getGoal();
      currentGoal.requirements = plan.requirements || [];
      currentGoal.acceptanceCriteria = (plan.acceptanceCriteria || []).map(c => ({
        id: c.id,
        description: c.description,
        verified: false,
        evidence: '',
        verifiedAt: null,
        verifiedBy: null
      }));
      db.saveGoal(currentGoal);

      // Populate task queue with canonical dependencies
      const normalizedTasks = this.normalizeTasks(plan.tasks || [], goalId);
      taskQueue.addTasks(normalizedTasks);

      // ==========================================
      // STAGE 2: AUTONOMOUS EXECUTION & DEBATE LOOP
      // ==========================================
      let iteration = 0;
      let goalVerified = false;

      while (iteration < maxIterations && !goalVerified) {
        iteration++;
        currentGoal.iteration = iteration;
        db.saveGoal(currentGoal);
        projectState.emitEvent('iteration_started', 'System', `Beginning Engineering Iteration ${iteration} of ${maxIterations}`, { iteration });

        // Process all actionable tasks
        let currentTask = taskQueue.getNextTask();
        while (currentTask) {
          if (this.activeRuns.get(goalId)?.aborted) {
            throw new Error('Goal execution aborted by user.');
          }

          projectState.updateGoalStatus('executing');
          taskQueue.startTask(currentTask.id, 'engineer', 'lead-model');

          // --- 1. Engineer Implementation ---
          projectState.emitEvent('task_stage', 'Engineer', `Executing Task: ${currentTask.title}`, { task: currentTask });
          const implementation = await engineer.implement(currentTask);
          const filesChanged = implementation.filesChanged || [];

          // --- 2. Independent Critical Review ---
          projectState.updateGoalStatus('reviewing');
          taskQueue.requestReview(currentTask.id);
          projectState.emitEvent('task_stage', 'Reviewer', `Critically Reviewing: ${currentTask.title}`, { task: currentTask, filesChanged });

          const review = await reviewer.review(currentTask, implementation, filesChanged);

          // --- 3. Adversarial Debate & Rebuttal / Revision ---
          if (review.decision !== 'APPROVE') {
            projectState.emitEvent('debate_started', 'System', `Reviewer requested revision (${review.decision}): ${review.findings.length} findings to address.`, { review });
            
            taskQueue.requestRevision(currentTask.id, review.findings);
            const debateResponse = await engineer.respondToCritique(currentTask, review);
            
            projectState.emitEvent('debate_resolved', 'Engineer', `Engineer addressed critique: ${debateResponse.summary}`, { debateResponse });
          }

          // Complete task
          taskQueue.completeTask(currentTask.id, implementation, filesChanged);
          projectState.emitEvent('task_completed', 'System', `Task Completed: ${currentTask.title}`, { task: currentTask });

          // Fetch next task
          currentTask = taskQueue.getNextTask();
        }

        // ==========================================
        // STAGE 3: RIGOROUS QA & ACCEPTANCE VERIFICATION
        // ==========================================
        projectState.updateGoalStatus('verifying');
        projectState.emitEvent('stage_started', 'QA', `Stage 3: Verifying Acceptance Criteria with Evidence`);

        const verification = await qa.verify(currentGoal, currentGoal.acceptanceCriteria);
        goalVerified = verification.goalComplete;

        if (goalVerified) {
          projectState.emitEvent('all_criteria_passed', 'QA', 'All acceptance criteria verified with direct evidence.', { verification });
          break;
        }

        // If not verified and iterations remain -> Replan remediation
        if (!goalVerified && iteration < maxIterations) {
          projectState.updateGoalStatus('planning');
          const failedCriteria = verification.criteriaResults.filter(c => !c.passed);
          projectState.emitEvent('replan_triggered', 'Planner', `${failedCriteria.length} acceptance criteria failed. Generating remediation tasks.`, { failedCriteria });

          const revisedPlan = await planner.replan(goalDescription, failedCriteria, taskQueue.getProgress());
          const remedialTasks = this.normalizeTasks(
            revisedPlan.tasks.map(t => ({ ...t, title: `[Remediation] ${t.title}` })),
            goalId
          );
          taskQueue.addTasks(remedialTasks);
        }
      }

      // ==========================================
      // FINAL COMPLETION
      // ==========================================
      const finalStatus = goalVerified ? 'completed' : 'failed';
      projectState.updateGoalStatus(finalStatus);

      const summary = {
        goalId,
        goalDescription,
        status: finalStatus,
        iterations: iteration,
        workspaceDir: resolvedWorkspace,
        filesGenerated: Array.from(projectState.filesChanged),
        tasksSummary: taskQueue.getProgress(),
        decisions: projectState.getDecisions(),
        acceptanceCriteria: projectState.getGoal()?.acceptanceCriteria || []
      };

      projectState.emitEvent('goal_finished', 'System', `Autonomous Goal ${finalStatus.toUpperCase()}: ${goalDescription}`, summary);
      
      return summary;

    } catch (error) {
      logger.error(`Orchestrator Goal Failure: ${error.message}`);
      projectState.updateGoalStatus('failed');
      projectState.emitEvent('goal_error', 'System', `Goal execution failed: ${error.message}`, { error: error.message });
      throw error;
    } finally {
      agentRegistry.cleanup(goalId);
      this.activeRuns.delete(goalId);
    }
  }

  abortGoal(goalId) {
    const run = this.activeRuns.get(goalId);
    if (run) {
      run.aborted = true;
      logger.warn(`Goal ${goalId} marked for abort.`);
      return true;
    }
    return false;
  }
}

export const orchestrator = new Orchestrator();
export default orchestrator;
