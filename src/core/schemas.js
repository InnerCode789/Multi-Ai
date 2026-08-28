import { z } from 'zod';
import crypto from 'crypto';

export const GoalSchema = z.object({
  id: z.string().uuid(),
  description: z.string().min(1),
  createdAt: z.string(),
  status: z.enum(['pending', 'planning', 'executing', 'reviewing', 'testing', 'verifying', 'completed', 'failed']),
  requirements: z.array(z.string()).default([]),
  acceptanceCriteria: z.array(z.object({
    id: z.string(),
    description: z.string(),
    verified: z.boolean().default(false),
    evidence: z.string().optional().default(''),
    verifiedAt: z.string().nullable().default(null),
    verifiedBy: z.string().nullable().default(null)
  })).default([]),
  iteration: z.number().int().min(0).default(0),
  maxIterations: z.number().int().min(1).default(10),
  workspaceDir: z.string()
});

export const TaskSchema = z.object({
  id: z.string().uuid(),
  goalId: z.string().uuid(),
  title: z.string(),
  description: z.string(),
  status: z.enum(['pending', 'in_progress', 'review', 'revision', 'completed', 'failed', 'blocked']),
  assignedAgent: z.string().nullable().default(null),
  assignedModel: z.string().nullable().default(null),
  dependencies: z.array(z.string()).default([]),
  priority: z.number().int().min(1).max(10).default(5),
  createdAt: z.string(),
  updatedAt: z.string(),
  completedAt: z.string().nullable().default(null),
  attempts: z.number().int().min(0).default(0),
  maxAttempts: z.number().int().min(1).default(3),
  filesChanged: z.array(z.string()).default([]),
  result: z.any().nullable().default(null)
});

export const AgentMessageSchema = z.object({
  id: z.string().uuid(),
  goalId: z.string().uuid(),
  taskId: z.string().uuid().nullable().default(null),
  fromAgent: z.string(),
  fromModel: z.string().optional().default(''),
  toAgent: z.string().nullable().default(null),
  type: z.enum([
    'plan', 'implementation', 'review', 'critique', 'defense', 
    'agreement', 'revision', 'question', 'verification', 'status', 'error', 'tool_call', 'tool_result'
  ]),
  content: z.string(),
  structured: z.any().nullable().default(null),
  timestamp: z.string(),
  replyTo: z.string().uuid().nullable().default(null)
});

export const ReviewSchema = z.object({
  decision: z.enum(['APPROVE', 'REVISE', 'REJECT']),
  severity: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']),
  findings: z.array(z.object({
    file: z.string().optional().default(''),
    line: z.number().int().optional(),
    issue: z.string(),
    suggestion: z.string().optional().default(''),
    severity: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'])
  })).default([]),
  summary: z.string(),
  confidence: z.number().min(0).max(1),
  approvedCriteria: z.array(z.string()).default([]),
  failedCriteria: z.array(z.string()).default([])
});

export const ToolCallSchema = z.object({
  tool: z.string(),
  args: z.record(z.any()),
  justification: z.string().optional()
});

export const ToolResultSchema = z.object({
  tool: z.string(),
  success: z.boolean(),
  output: z.any().nullable(),
  error: z.string().nullable().default(null),
  executionTimeMs: z.number().int()
});

export const PlanSchema = z.object({
  goalAnalysis: z.string().optional().default(''),
  requirements: z.array(z.string()).default([]),
  acceptanceCriteria: z.array(z.object({
    id: z.string(),
    description: z.string()
  })).default([]),
  tasks: z.array(z.object({
    title: z.string(),
    description: z.string(),
    agentRole: z.string().default('engineer'),
    priority: z.number().int().min(1).max(10).default(5),
    dependencies: z.array(z.string()).default([])
  })).default([]),
  architecture: z.string().optional().default(''),
  risks: z.array(z.string()).default([])
});

export const VerificationSchema = z.object({
  goalComplete: z.boolean(),
  criteriaResults: z.array(z.object({
    id: z.string(),
    description: z.string(),
    passed: z.boolean(),
    evidence: z.string(),
    method: z.enum(['test', 'inspection', 'runtime', 'manual'])
  })),
  summary: z.string(),
  remainingWork: z.array(z.string()).default([]),
  confidence: z.number().min(0).max(1)
});

export const DecisionSchema = z.object({
  id: z.string().uuid(),
  goalId: z.string().uuid(),
  taskId: z.string().uuid().nullable().default(null),
  type: z.enum(['architecture', 'technology', 'approach', 'tradeoff', 'resolution', 'critique_response']),
  title: z.string(),
  description: z.string(),
  proposedBy: z.string(),
  agreedBy: z.array(z.string()).default([]),
  disagreedBy: z.array(z.string()).default([]),
  status: z.enum(['proposed', 'accepted', 'rejected', 'superseded']),
  timestamp: z.string()
});

export function generateId() {
  return crypto.randomUUID();
}
