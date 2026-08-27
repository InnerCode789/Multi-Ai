import { BaseAgent } from './baseAgent.js';
import logger from '../utils/logger.js';

export class EngineerAgent extends BaseAgent {
  constructor(projectState) {
    super({
      role: 'engineer',
      name: 'Lead Engineer',
      description: 'Architects and writes production-ready code, modifies project files, runs tests, and integrates features.',
      systemPrompt: `You are the Lead Software Engineer in an autonomous multi-agent engineering system.
Your responsibility:
1. Implement the requested task by writing clean, modular, production-ready code.
2. You have access to tools to inspect files (read_file, list_directory, search_files) and modify files (write_file, delete_file) and run sandbox commands (run_command, run_tests).
3. Always inspect existing codebase structure before writing code to maintain consistency.
4. When writing code, write COMPLETE file contents with no placeholders or stubs.
5. When responding to code reviews:
   - Carefully analyze each criticism.
   - If the reviewer is correct, accept the finding, explain the fix, and modify the code using tools.
   - If the reviewer is mistaken or proposing an inferior approach, defend your technical rationale clearly with evidence.`,
      projectState
    });
  }

  async implement(task) {
    logger.info(`[Engineer] Implementing Task: "${task.title}"`);
    this.projectState?.emitEvent('engineer_working', 'Engineer', `Starting implementation of: ${task.title}`, { task });

    const instructions = `You must implement the following task completely:
Title: ${task.title}
Description: ${task.description}

Use your tools to read existing code if needed, write new files, update existing files, and verify syntax.
When you have finished, return your final response with action="respond", detailing the files created/modified and summary of changes.`;

    const result = await this.executeWithTools(task, instructions, 15);
    
    this.projectState?.emitEvent('engineer_completed', 'Engineer', `Finished implementation of: ${task.title}`, {
      task,
      summary: result.summary,
      filesChanged: result.filesChanged || []
    });

    return result;
  }

  async respondToCritique(task, review) {
    logger.info(`[Engineer] Evaluating Reviewer Critique for Task: "${task.title}" (Decision: ${review.decision})`);

    const instructions = `The Critical Reviewer has evaluated your implementation of Task "${task.title}".

Reviewer Verdict: ${review.decision} (Severity: ${review.severity})
Review Summary: ${review.summary}
Findings:
${JSON.stringify(review.findings, null, 2)}

Your task:
1. Evaluate each finding.
2. For valid issues, use your tools (write_file) to fix the code and resolve the problems.
3. For invalid or counter-productive issues, articulate why you disagree based on engineering requirements.
4. Return a structured decision explaining:
   - Which findings you ACCEPTED and FIXED (with file names).
   - Which findings you REJECTED and DEFENDED (with technical justification).
   - Overall conclusion.`;

    const result = await this.executeWithTools(task, instructions, 15);

    // Record decision in shared state
    this.projectState?.addDecision({
      taskId: task.id,
      type: 'critique_response',
      title: `Response to Review on "${task.title}"`,
      description: result.summary || result.deliverable,
      proposedBy: 'Engineer',
      status: review.decision === 'APPROVE' ? 'accepted' : 'resolution'
    });

    return result;
  }
}
