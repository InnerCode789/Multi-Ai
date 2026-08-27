import { test } from 'node:test';
import assert from 'node:assert';
import path from 'path';
import fs from 'fs';
import { ProjectState } from '../../core/projectState.js';
import { TaskQueue } from '../../core/taskQueue.js';
import { setupFileTools } from '../../tools/fileTools.js';
import { toolRegistry } from '../../tools/toolRegistry.js';
import { generateId } from '../../core/schemas.js';
import db from '../../db/database.js';

test('Integration - Full Autonomous Loop (Planning -> Implementation -> Review -> Debate -> QA -> Verified)', async () => {
  const goalId = generateId();
  const testWorkspace = path.resolve('./workspaces/test_integration');
  if (!fs.existsSync(testWorkspace)) {
    fs.mkdirSync(testWorkspace, { recursive: true });
  }

  setupFileTools(testWorkspace);

  // 1. Goal initialization
  const goal = {
    id: goalId,
    description: 'Build a minimalist calculator CLI module',
    status: 'planning',
    requirements: ['Support addition and subtraction', 'Export calculate function'],
    acceptanceCriteria: [
      { id: 'crit_1', description: 'calculator.js exists and exports calculate', verified: false, evidence: '', verifiedAt: null, verifiedBy: null },
      { id: 'crit_2', description: 'calculate(2, 3, "+") returns 5', verified: false, evidence: '', verifiedAt: null, verifiedBy: null }
    ],
    iteration: 0,
    maxIterations: 5,
    workspaceDir: testWorkspace,
    createdAt: new Date().toISOString()
  };
  db.saveGoal(goal);

  const state = new ProjectState(goalId);
  const queue = new TaskQueue(state);

  // 2. Planning: decompose into tasks
  const task = queue.addTask({
    id: generateId(),
    goalId,
    title: 'Implement Calculator Engine',
    description: 'Create calculator.js with calculate(a, b, op) function',
    status: 'pending',
    assignedAgent: 'engineer',
    priority: 1
  });

  // 3. Lead Engineer writes code
  queue.startTask(task.id, 'engineer', 'lead-model');
  const codeContent = `export function calculate(a, b, op) {
  if (op === '+') return a + b;
  if (op === '-') return a - b;
  throw new Error('Unsupported operator: ' + op);
}`;

  await toolRegistry.executeTool('write_file', {
    filePath: 'calculator.js',
    content: codeContent
  }, 'engineer');

  // 4. Critical Reviewer inspects code
  queue.requestReview(task.id);
  const readRes = await toolRegistry.executeTool('read_file', {
    filePath: 'calculator.js'
  }, 'reviewer');

  assert.strictEqual(readRes.success, true);
  assert.match(readRes.output, /calculate/);

  // Reviewer finds missing multiplication support
  const review = {
    decision: 'REVISE',
    severity: 'MEDIUM',
    findings: [{ issue: 'Calculator lacks multiplication operator *', suggestion: 'Add * branch', severity: 'MEDIUM' }],
    summary: 'Solid core but should handle *',
    confidence: 0.9
  };

  // 5. Debate & Revision: Engineer accepts critique and updates code
  queue.requestRevision(task.id, review.findings);
  const revisedCode = `export function calculate(a, b, op) {
  if (op === '+') return a + b;
  if (op === '-') return a - b;
  if (op === '*') return a * b;
  throw new Error('Unsupported operator: ' + op);
}`;

  await toolRegistry.executeTool('write_file', {
    filePath: 'calculator.js',
    content: revisedCode
  }, 'engineer');

  queue.completeTask(task.id, { revised: true }, ['calculator.js']);

  // 6. QA verifies criteria
  state.updateAcceptanceCriteria('crit_1', true, 'calculator.js exists and exports calculate', 'QA');
  state.updateAcceptanceCriteria('crit_2', true, 'calculate(2, 3, "+") returns 5', 'QA');

  assert.strictEqual(state.isGoalComplete(), true);
  state.updateGoalStatus('completed');

  const finalGoal = state.getGoal();
  assert.strictEqual(finalGoal.status, 'completed');
  assert.strictEqual(finalGoal.acceptanceCriteria.every(c => c.verified), true);

  // Clean up
  fs.rmSync(testWorkspace, { recursive: true, force: true });
});
