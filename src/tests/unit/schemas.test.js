import { test } from 'node:test';
import assert from 'node:assert';
import { 
  GoalSchema, 
  TaskSchema, 
  PlanSchema, 
  ReviewSchema, 
  VerificationSchema, 
  DecisionSchema, 
  generateId 
} from '../../core/schemas.js';

test('Schemas - GoalSchema validation', () => {
  const validGoal = {
    id: generateId(),
    description: 'Build modern ChatGPT UI',
    createdAt: new Date().toISOString(),
    status: 'planning',
    requirements: ['Sidebar', 'Chat stream'],
    acceptanceCriteria: [{ id: 'crit_1', description: 'Sidebar renders' }],
    iteration: 0,
    maxIterations: 10,
    workspaceDir: './workspaces/test'
  };

  const parsed = GoalSchema.parse(validGoal);
  assert.strictEqual(parsed.description, 'Build modern ChatGPT UI');
  assert.strictEqual(parsed.acceptanceCriteria.length, 1);
});

test('Schemas - PlanSchema validation', () => {
  const validPlan = {
    goalAnalysis: 'Microservices architecture with Next.js frontend',
    requirements: ['Responsive sidebar', 'SSE token streaming'],
    acceptanceCriteria: [
      { id: 'crit_1', description: 'Sidebar toggles on mobile' },
      { id: 'crit_2', description: 'Stream reader decodes tokens' }
    ],
    tasks: [
      {
        title: 'Create layout skeleton',
        description: 'Set up HTML grid layout',
        agentRole: 'engineer',
        priority: 1,
        dependencies: []
      }
    ],
    architecture: 'Standard modern frontend',
    risks: ['Browser compatibility']
  };

  const parsed = PlanSchema.parse(validPlan);
  assert.strictEqual(parsed.tasks.length, 1);
  assert.strictEqual(parsed.acceptanceCriteria.length, 2);
});

test('Schemas - ReviewSchema validation', () => {
  const validReview = {
    decision: 'REVISE',
    severity: 'HIGH',
    findings: [
      {
        file: 'src/app.js',
        line: 42,
        issue: 'Memory leak in EventSource listener',
        suggestion: 'Clean up listener on component unmount',
        severity: 'HIGH'
      }
    ],
    summary: 'Good implementation but has critical memory leak in SSE stream',
    confidence: 0.95,
    approvedCriteria: ['crit_1'],
    failedCriteria: ['crit_2']
  };

  const parsed = ReviewSchema.parse(validReview);
  assert.strictEqual(parsed.decision, 'REVISE');
  assert.strictEqual(parsed.findings[0].severity, 'HIGH');
});

test('Schemas - VerificationSchema validation', () => {
  const validVerification = {
    goalComplete: true,
    criteriaResults: [
      {
        id: 'crit_1',
        description: 'Sidebar toggles',
        passed: true,
        evidence: 'HTML contains sidebar and JS handles click',
        method: 'inspection'
      }
    ],
    summary: 'All criteria verified with direct evidence',
    remainingWork: [],
    confidence: 0.99
  };

  const parsed = VerificationSchema.parse(validVerification);
  assert.strictEqual(parsed.goalComplete, true);
  assert.strictEqual(parsed.criteriaResults[0].passed, true);
});
