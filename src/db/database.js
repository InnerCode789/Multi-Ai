import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.resolve(__dirname, '../../data');

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const DB_PATH = path.join(DATA_DIR, 'multi-ai.db');

class StorageEngine {
  constructor() {
    this.sqlite = null;
    this.fallbackFile = path.join(DATA_DIR, 'storage_journal.json');
    this.fallbackState = {
      goals: new Map(),
      tasks: new Map(),
      messages: [],
      decisions: [],
      events: []
    };
    this.init();
  }

  init() {
    this.initFallbackStorage();
  }

  initFallbackStorage() {
    if (fs.existsSync(this.fallbackFile)) {
      try {
        const raw = fs.readFileSync(this.fallbackFile, 'utf8');
        const parsed = JSON.parse(raw);
        if (parsed.goals) this.fallbackState.goals = new Map(Object.entries(parsed.goals));
        if (parsed.tasks) this.fallbackState.tasks = new Map(Object.entries(parsed.tasks));
        if (parsed.messages) this.fallbackState.messages = parsed.messages;
        if (parsed.decisions) this.fallbackState.decisions = parsed.decisions;
        if (parsed.events) this.fallbackState.events = parsed.events;
      } catch (e) {
        // journal corrupted, start fresh
      }
    }
  }

  persistFallback() {
    if (!this.fallbackFile) return;
    try {
      const obj = {
        goals: Object.fromEntries(this.fallbackState.goals),
        tasks: Object.fromEntries(this.fallbackState.tasks),
        messages: this.fallbackState.messages,
        decisions: this.fallbackState.decisions,
        events: this.fallbackState.events
      };
      fs.writeFileSync(this.fallbackFile, JSON.stringify(obj, null, 2), 'utf8');
    } catch (e) {
      // ignore
    }
  }

  // --- Goals ---
  saveGoal(goal) {
    this.fallbackState.goals.set(goal.id, { ...goal, updatedAt: new Date().toISOString() });
    this.persistFallback();
  }

  getGoal(id) {
    return this.fallbackState.goals.get(id) || null;
  }

  listGoals() {
    return Array.from(this.fallbackState.goals.values()).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }

  // --- Tasks ---
  saveTask(task) {
    this.fallbackState.tasks.set(task.id, { ...task, updatedAt: new Date().toISOString() });
    this.persistFallback();
  }

  getTask(id) {
    return this.fallbackState.tasks.get(id) || null;
  }

  getTasksByGoal(goalId) {
    return Array.from(this.fallbackState.tasks.values())
      .filter(t => t.goalId === goalId)
      .sort((a, b) => (a.priority || 5) - (b.priority || 5));
  }

  // --- Messages ---
  saveMessage(msg) {
    this.fallbackState.messages.push(msg);
    this.persistFallback();
  }

  getMessagesByGoal(goalId, limit = 100) {
    return this.fallbackState.messages.filter(m => m.goalId === goalId).slice(-limit);
  }

  // --- Decisions ---
  saveDecision(dec) {
    const idx = this.fallbackState.decisions.findIndex(d => d.id === dec.id);
    if (idx >= 0) this.fallbackState.decisions[idx] = dec;
    else this.fallbackState.decisions.push(dec);
    this.persistFallback();
  }

  getDecisionsByGoal(goalId) {
    return this.fallbackState.decisions.filter(d => d.goalId === goalId);
  }

  // --- Events ---
  saveEvent(evt) {
    this.fallbackState.events.push(evt);
    this.persistFallback();
  }

  getEventsByGoal(goalId) {
    return this.fallbackState.events.filter(e => e.goalId === goalId);
  }
}

const db = new StorageEngine();
export default db;
