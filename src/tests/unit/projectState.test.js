import { test } from 'node:test';
import assert from 'node:assert';
import { ProjectState } from '../../core/projectState.js';
import { TaskQueue } from '../../core/taskQueue.js';
import { generateId } from '../../core/schemas.js';
import db from '../../db/database.js';

test('ProjectState & TaskQueue - State transitions and dependency resolution', () => {
  const goalId = generateId();
  db.saveGoal({
    id: goalId,
    description: 'Test Goal',
    status: 'planning',
    requirements: ['Req 1'],
    acceptanceCriteria: [
      { id: 'crit_1', description: 'Criterion 1', verified: false, evidence: '', verifiedAt: null, verifiedBy: null }
    ],
    iteration: 0,
    maxIterations: 5,
    workspaceDir: './workspaces/test_ws',
    createdAt: new Date().toISOString()
  });

  const state = new ProjectState(goalId);
  const queue = new TaskQueue(state);

  // 1. Create dependent tasks
  const task1 = queue.addTask({
    id: generateId(),
    goalId,
    title: 'Task 1: Setup Backend',
    description: 'Init express server',
    priority: 1,
    dependencies: []
  });

  const task2 = queue.addTask({
    id: generateId(),
    goalId,
    title: 'Task 2: Setup Frontend',
    description: 'Connect to backend API',
    priority: 2,
    dependencies: [task1.id] // Depends on Task 1
  });

  // 2. Next task should be Task 1 (Task 2 blocked by dependency)
  let next = queue.getNextTask();
  assert.strictEqual(next.id, task1.id);

  // 3. Start and complete Task 1
  queue.startTask(task1.id, 'engineer', 'test-model');
  let inProgressTask = state.getTask(task1.id);
  assert.strictEqual(inProgressTask.status, 'in_progress');
  assert.strictEqual(inProgressTask.attempts, 1);

  queue.completeTask(task1.id, { files: ['server.js'] }, ['server.js']);
  let completedTask = state.getTask(task1.id);
  assert.strictEqual(completedTask.status, 'completed');

  // 4. Next task should now be Task 2
  next = queue.getNextTask();
  assert.strictEqual(next.id, task2.id);

  // 5. Criteria verification update
  state.updateAcceptanceCriteria('crit_1', true, 'server.js exists and responds on port 3000', 'QA Agent');
  const goal = state.getGoal();
  assert.strictEqual(goal.acceptanceCriteria[0].verified, true);
  assert.strictEqual(state.isGoalComplete(), true);
});
