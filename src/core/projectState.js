import db from '../db/database.js';
import { generateId, GoalSchema } from './schemas.js';
import logger from '../utils/logger.js';
import EventEmitter from 'events';

export class ProjectState extends EventEmitter {
  constructor(goalId) {
    super();
    this.goalId = goalId;
    this.filesChanged = new Set();
  }

  getGoal() {
    return db.getGoal(this.goalId);
  }

  updateGoalStatus(status) {
    const goal = this.getGoal();
    if (!goal) return;
    goal.status = status;
    db.saveGoal(goal);
    this.emitEvent('goal_status_changed', 'System', `Goal status changed to ${status}`, { status });
  }

  updateAcceptanceCriteria(criteriaId, verified, evidence, verifiedBy) {
    const goal = this.getGoal();
    if (!goal) return;
    const criterion = goal.acceptanceCriteria.find(c => c.id === criteriaId);
    if (criterion) {
      criterion.verified = verified;
      criterion.evidence = evidence || '';
      criterion.verifiedAt = verified ? new Date().toISOString() : null;
      criterion.verifiedBy = verifiedBy || null;
      db.saveGoal(goal);
      this.emitEvent('criterion_updated', verifiedBy || 'QA', `Criterion ${criteriaId}: ${verified ? 'PASSED' : 'FAILED'}`, { criterion });
    }
  }

  getTasks() {
    return db.getTasksByGoal(this.goalId);
  }

  getTask(taskId) {
    return db.getTask(taskId);
  }

  createTask(taskData) {
    const task = {
      id: taskData.id || generateId(),
      goalId: this.goalId,
      title: taskData.title,
      description: taskData.description,
      status: taskData.status || 'pending',
      assignedAgent: taskData.assignedAgent || null,
      assignedModel: taskData.assignedModel || null,
      dependencies: taskData.dependencies || [],
      priority: taskData.priority || 5,
      attempts: taskData.attempts || 0,
      maxAttempts: taskData.maxAttempts || 3,
      filesChanged: taskData.filesChanged || [],
      result: taskData.result || null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      completedAt: null
    };
    db.saveTask(task);
    this.emitEvent('task_created', 'Planner', `Task created: ${task.title}`, { task });
    return task;
  }

  updateTask(taskId, updates) {
    const task = this.getTask(taskId);
    if (!task) return null;
    const updated = { ...task, ...updates, updatedAt: new Date().toISOString() };
    if (updates.filesChanged) {
      updates.filesChanged.forEach(f => this.filesChanged.add(f));
    }
    db.saveTask(updated);
    this.emitEvent('task_updated', updated.assignedAgent || 'System', `Task updated: ${updated.title} -> ${updated.status}`, { task: updated });
    return updated;
  }

  getMessages(limit = 100) {
    return db.getMessagesByGoal(this.goalId, limit);
  }

  addMessage(messageData) {
    const message = {
      id: messageData.id || generateId(),
      goalId: this.goalId,
      taskId: messageData.taskId || null,
      fromAgent: messageData.fromAgent,
      fromModel: messageData.fromModel || '',
      toAgent: messageData.toAgent || null,
      type: messageData.type,
      content: messageData.content,
      structured: messageData.structured || null,
      timestamp: messageData.timestamp || new Date().toISOString(),
      replyTo: messageData.replyTo || null
    };
    db.saveMessage(message);
    this.emitEvent('message', message.fromAgent, message.content.slice(0, 100), { message });
    return message;
  }

  getDecisions() {
    return db.getDecisionsByGoal(this.goalId);
  }

  addDecision(decisionData) {
    const decision = {
      id: decisionData.id || generateId(),
      goalId: this.goalId,
      taskId: decisionData.taskId || null,
      type: decisionData.type,
      title: decisionData.title,
      description: decisionData.description,
      proposedBy: decisionData.proposedBy,
      agreedBy: decisionData.agreedBy || [],
      disagreedBy: decisionData.disagreedBy || [],
      status: decisionData.status || 'proposed',
      timestamp: new Date().toISOString()
    };
    db.saveDecision(decision);
    this.emitEvent('decision', decision.proposedBy, `Decision: ${decision.title} (${decision.status})`, { decision });
    return decision;
  }

  emitEvent(type, agent, summary, data = null) {
    const evt = {
      id: generateId(),
      goalId: this.goalId,
      type,
      agent,
      summary,
      data,
      timestamp: new Date().toISOString()
    };
    db.saveEvent(evt);
    this.emit('event', evt);
    logger.info(`[${agent}] [${type.toUpperCase()}]: ${summary}`);
    return evt;
  }

  getEvents() {
    return db.getEventsByGoal(this.goalId);
  }

  getSummary() {
    const goal = this.getGoal();
    const tasks = this.getTasks();
    const decisions = this.getDecisions();
    return {
      goalId: this.goalId,
      status: goal?.status,
      iteration: goal?.iteration,
      totalTasks: tasks.length,
      completedTasks: tasks.filter(t => t.status === 'completed').length,
      filesChanged: Array.from(this.filesChanged),
      decisionsCount: decisions.length,
      acceptanceCriteria: goal?.acceptanceCriteria || []
    };
  }

  isGoalComplete() {
    const goal = this.getGoal();
    if (!goal || !goal.acceptanceCriteria || goal.acceptanceCriteria.length === 0) return false;
    return goal.acceptanceCriteria.every(c => c.verified === true);
  }
}
