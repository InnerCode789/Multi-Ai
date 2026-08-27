import { TaskSchema } from './schemas.js';
import logger from '../utils/logger.js';

export class TaskQueue {
  constructor(projectState) {
    this.projectState = projectState;
  }

  addTask(taskData) {
    return this.projectState.createTask(taskData);
  }

  addTasks(tasksArray) {
    return tasksArray.map(t => this.addTask(t));
  }

  getNextTask() {
    const tasks = this.projectState.getTasks();
    const completedTaskIds = new Set(
      tasks.filter(t => t.status === 'completed').map(t => t.id)
    );

    // Find pending/revision task whose dependencies are all completed
    const available = tasks.filter(t => {
      if (t.status !== 'pending' && t.status !== 'revision') return false;
      const deps = t.dependencies || [];
      return deps.every(depId => completedTaskIds.has(depId));
    });

    if (available.length === 0) return null;

    // Sort by priority (1 is highest) and createdAt
    available.sort((a, b) => {
      if (a.priority !== b.priority) return a.priority - b.priority;
      return new Date(a.createdAt) - new Date(b.createdAt);
    });

    return available[0];
  }

  startTask(taskId, agentRole, modelName) {
    return this.projectState.updateTask(taskId, {
      status: 'in_progress',
      assignedAgent: agentRole,
      assignedModel: modelName,
      attempts: (this.projectState.getTask(taskId)?.attempts || 0) + 1
    });
  }

  completeTask(taskId, result = null, filesChanged = []) {
    return this.projectState.updateTask(taskId, {
      status: 'completed',
      result,
      filesChanged,
      completedAt: new Date().toISOString()
    });
  }

  requestReview(taskId) {
    return this.projectState.updateTask(taskId, {
      status: 'review'
    });
  }

  requestRevision(taskId, findings) {
    const task = this.projectState.getTask(taskId);
    if (!task) return null;

    if (task.attempts >= task.maxAttempts) {
      logger.warn(`Task ${task.title} exceeded max attempts (${task.maxAttempts}). Marking failed.`);
      return this.projectState.updateTask(taskId, {
        status: 'failed',
        result: { error: 'Max review revision attempts exceeded', findings }
      });
    }

    return this.projectState.updateTask(taskId, {
      status: 'revision',
      result: { findings }
    });
  }

  failTask(taskId, error) {
    return this.projectState.updateTask(taskId, {
      status: 'failed',
      result: { error: typeof error === 'string' ? error : error?.message || 'Task failed' }
    });
  }

  areAllTasksComplete() {
    const tasks = this.projectState.getTasks();
    if (tasks.length === 0) return false;
    return tasks.every(t => t.status === 'completed');
  }

  hasFailedTasks() {
    const tasks = this.projectState.getTasks();
    return tasks.some(t => t.status === 'failed');
  }

  getProgress() {
    const tasks = this.projectState.getTasks();
    return {
      total: tasks.length,
      completed: tasks.filter(t => t.status === 'completed').length,
      inProgress: tasks.filter(t => t.status === 'in_progress').length,
      review: tasks.filter(t => t.status === 'review').length,
      revision: tasks.filter(t => t.status === 'revision').length,
      failed: tasks.filter(t => t.status === 'failed').length,
      pending: tasks.filter(t => t.status === 'pending').length
    };
  }
}
