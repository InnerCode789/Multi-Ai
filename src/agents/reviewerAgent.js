import { BaseAgent } from './baseAgent.js';
import { ReviewSchema } from '../core/schemas.js';
import { modelRouter } from '../providers/modelRouter.js';
import logger from '../utils/logger.js';

export class ReviewerAgent extends BaseAgent {
  constructor(projectState) {
    super({
      role: 'reviewer',
      name: 'Critical Reviewer',
      description: 'Independently inspects actual codebase changes, challenges assumptions, finds bugs, and provides structured reviews.',
      systemPrompt: `You are the Critical Code Reviewer and Security/Architecture Auditor in an autonomous engineering team.
Your responsibility:
1. Examine the actual files written or changed by the Lead Engineer.
2. Challenge weak architecture choices, race conditions, memory leaks, security vulnerabilities, missing error handling, and unfulfilled requirements.
3. Be uncompromising on quality, but fair and constructive with concrete suggestions.
4. Output your review strictly as JSON conforming to the ReviewSchema.
5. If the code is genuinely solid and meets all acceptance criteria, APPROVE it. If it has flaws, mark REVISE or REJECT with specific findings.`,
      projectState
    });
  }

  async review(task, implementationResult, filesChanged = []) {
    logger.info(`[Reviewer] Inspecting implementation for Task: "${task.title}"`);
    this.projectState?.emitEvent('reviewer_inspecting', 'Reviewer', `Beginning critical review of: ${task.title}`, { task, filesChanged });

    // First use tools to inspect the actual files
    const instructions = `You are reviewing the Engineer's implementation of:
Task: "${task.title}"
Description: ${task.description}
Files Changed: ${JSON.stringify(filesChanged)}
Engineer Summary: ${implementationResult.summary || implementationResult.deliverable || 'None'}

Use your read_file and list_directory tools to inspect the code in the workspace and verify its quality.
Once you have inspected the code, formulate your final review verdict.`;

    const inspection = await this.executeWithTools(task, instructions, 10);

    // Now format structured review
    const reviewPrompt = `Based on your inspection of the actual code files for Task "${task.title}":
Task Goal: ${task.description}
Inspection Notes: ${inspection.summary || inspection.deliverable || ''}

Provide your final structured review adhering to this JSON schema:
{
  "decision": "APPROVE" | "REVISE" | "REJECT",
  "severity": "LOW" | "MEDIUM" | "HIGH" | "CRITICAL",
  "findings": [
    {
      "file": "path/to/file.js",
      "line": 42,
      "issue": "Description of defect, risk, or missing requirement",
      "suggestion": "How to fix it properly",
      "severity": "LOW" | "MEDIUM" | "HIGH" | "CRITICAL"
    }
  ],
  "summary": "Comprehensive assessment of code quality, architecture, and correctness",
  "confidence": 0.95,
  "approvedCriteria": ["List of criteria IDs verified"],
  "failedCriteria": ["List of criteria IDs failed"]
}`;

    const response = await modelRouter.generateStructuredForAgent('reviewer', {
      systemPrompt: this.systemPrompt,
      userPrompt: reviewPrompt
    });

    const parsedReview = ReviewSchema.parse(response.structured);
    
    this.recordMessage('review', `Review for "${task.title}": ${parsedReview.decision} (${parsedReview.severity}) - ${parsedReview.findings.length} findings.`, parsedReview, task.id);
    
    this.projectState?.emitEvent('review_completed', 'Reviewer', `Review: ${parsedReview.decision} with ${parsedReview.findings.length} findings`, {
      task,
      review: parsedReview
    });

    return parsedReview;
  }
}
