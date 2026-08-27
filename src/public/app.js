document.addEventListener('DOMContentLoaded', () => {
  // Elements
  const goalInput = document.getElementById('goal-input');
  const maxIterationsSelect = document.getElementById('max-iterations');
  const startBtn = document.getElementById('start-goal-btn');
  const stopBtn = document.getElementById('stop-goal-btn');
  
  const statusIndicator = document.getElementById('system-status-indicator');
  const statusText = document.getElementById('status-text');
  
  const feedContainer = document.getElementById('feed-container');
  const taskList = document.getElementById('task-list');
  const taskCount = document.getElementById('task-count');
  const criteriaList = document.getElementById('criteria-list');
  const criteriaProgress = document.getElementById('criteria-progress');
  const filesContainer = document.getElementById('files-container');
  const decisionsList = document.getElementById('decisions-list');
  const workspacePathLabel = document.getElementById('workspace-path-label');
  
  const filterBtns = document.querySelectorAll('.filter-btn');

  // Stage steps
  const stageSteps = {
    planning: document.getElementById('step-planning'),
    engineering: document.getElementById('step-engineering'),
    reviewing: document.getElementById('step-reviewing'),
    debating: document.getElementById('step-debating'),
    verifying: document.getElementById('step-verifying')
  };

  // State
  let isRunning = false;
  let abortController = null;
  let tasksMap = new Map();
  let criteriaMap = new Map();
  let filesSet = new Set();
  let decisionsMap = new Map();
  let allEvents = [];
  let currentFilter = 'all';

  // Configure Marked with Highlight.js
  if (window.marked) {
    marked.setOptions({
      highlight: function(code, lang) {
        if (window.hljs && hljs.getLanguage(lang)) {
          return hljs.highlight(code, { language: lang }).value;
        }
        return code;
      },
      breaks: true
    });
  }

  // Fetch initial system status
  fetchSystemStatus();

  // Event Listeners
  startBtn.addEventListener('click', launchGoal);
  stopBtn.addEventListener('click', abortGoal);

  goalInput.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.key === 'Enter') {
      if (!isRunning) launchGoal();
    }
  });

  filterBtns.forEach(btn => {
    btn.addEventListener('click', (e) => {
      filterBtns.forEach(b => b.classList.remove('active'));
      e.target.classList.add('active');
      currentFilter = e.target.dataset.filter;
      renderFeed();
    });
  });

  async function fetchSystemStatus() {
    try {
      const res = await fetch('/api/status');
      if (res.ok) {
        const data = await res.json();
        if (data.providers?.routing) {
          const r = data.providers.routing;
          if (r.planner) document.getElementById('badge-planner').textContent = `${r.planner.provider} (${r.planner.model})`;
          if (r.engineer) document.getElementById('badge-engineer').textContent = `${r.engineer.provider} (${r.engineer.model})`;
          if (r.reviewer) document.getElementById('badge-reviewer').textContent = `${r.reviewer.provider} (${r.reviewer.model})`;
          if (r.qa) document.getElementById('badge-qa').textContent = `${r.qa.provider} (${r.qa.model})`;
        }
      }
    } catch (err) {
      console.warn('Could not fetch status:', err);
    }
  }

  async function launchGoal() {
    const goal = goalInput.value.trim();
    if (!goal) {
      alert('Please describe your software engineering goal.');
      goalInput.focus();
      return;
    }

    // Reset UI
    isRunning = true;
    startBtn.style.display = 'none';
    stopBtn.style.display = 'flex';
    statusText.textContent = 'Engineering in Progress...';
    
    tasksMap.clear();
    criteriaMap.clear();
    filesSet.clear();
    decisionsMap.clear();
    allEvents = [];
    
    feedContainer.innerHTML = '';
    taskList.innerHTML = '<div class="empty-state">Initializing tasks...</div>';
    criteriaList.innerHTML = '<div class="empty-state">Formulating acceptance criteria...</div>';
    filesContainer.innerHTML = '<div class="empty-state">Waiting for file modifications...</div>';
    decisionsList.innerHTML = '<div class="empty-state">No decisions logged yet.</div>';

    setStage('planning');
    abortController = new AbortController();

    try {
      const response = await fetch('/api/goal/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          goal,
          maxIterations: parseInt(maxIterationsSelect.value, 10)
        }),
        signal: abortController.signal
      });

      if (!response.ok) {
        throw new Error(`Server returned HTTP ${response.status}`);
      }

      // Read SSE stream
      const reader = response.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        let currentEvent = null;
        let currentData = [];

        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed.startsWith('event:')) {
            currentEvent = trimmed.slice(6).trim();
          } else if (trimmed.startsWith('data:')) {
            currentData.push(trimmed.slice(5).trim());
          } else if (trimmed === '') {
            if (currentEvent && currentData.length > 0) {
              const rawData = currentData.join('\n');
              try {
                const parsed = JSON.parse(rawData);
                handleServerEvent(currentEvent, parsed);
              } catch (e) {
                // handle raw text
                handleServerEvent(currentEvent, rawData);
              }
              currentEvent = null;
              currentData = [];
            }
          }
        }
      }

    } catch (err) {
      if (err.name === 'AbortError') {
        appendEventToFeed({
          agent: 'System',
          type: 'goal_aborted',
          summary: 'Goal execution was manually aborted by the user.',
          timestamp: new Date().toISOString()
        });
      } else {
        console.error('Goal execution error:', err);
        appendEventToFeed({
          agent: 'System',
          type: 'goal_error',
          summary: `Error: ${err.message}`,
          timestamp: new Date().toISOString()
        });
      }
    } finally {
      finishRun();
    }
  }

  function abortGoal() {
    if (abortController) {
      abortController.abort();
    }
  }

  function finishRun() {
    isRunning = false;
    startBtn.style.display = 'flex';
    stopBtn.style.display = 'none';
    statusText.textContent = 'System Ready';
  }

  function handleServerEvent(event, data) {
    if (event === 'agent_event') {
      processAgentEvent(data);
    } else if (event === 'goal_complete') {
      statusText.textContent = 'Goal Verified & Completed!';
      setStage('verifying', true);
      appendEventToFeed({
        agent: 'System',
        type: 'goal_complete',
        summary: `🎉 Goal Fully Verified! Status: ${data.status.toUpperCase()}`,
        data,
        timestamp: new Date().toISOString()
      });
      if (data.workspaceDir) {
        workspacePathLabel.textContent = data.workspaceDir;
      }
    } else if (event === 'error') {
      appendEventToFeed({
        agent: 'System',
        type: 'error',
        summary: `Error: ${data.message || JSON.stringify(data)}`,
        timestamp: new Date().toISOString()
      });
    }
  }

  function processAgentEvent(evt) {
    allEvents.push(evt);

    // Update Stage tracker
    if (evt.type === 'stage_started' || evt.type === 'goal_started') {
      if (evt.agent === 'Planner') setStage('planning');
      if (evt.agent === 'Engineer') setStage('engineering');
      if (evt.agent === 'Reviewer') setStage('reviewing');
      if (evt.agent === 'QA') setStage('verifying');
    }

    if (evt.type === 'debate_started') {
      setStage('debating');
    }

    // Process tasks
    if (evt.type === 'plan_created' && evt.data?.plan?.tasks) {
      evt.data.plan.tasks.forEach(t => {
        tasksMap.set(t.title, { ...t, status: 'pending' });
      });
      if (evt.data.plan.acceptanceCriteria) {
        evt.data.plan.acceptanceCriteria.forEach(c => {
          criteriaMap.set(c.id, { ...c, verified: false });
        });
      }
      renderTasks();
      renderCriteria();
    }

    if (evt.type === 'task_stage' && evt.data?.task) {
      const t = evt.data.task;
      tasksMap.set(t.title, { ...t, status: evt.agent === 'Reviewer' ? 'review' : 'in_progress' });
      renderTasks();
    }

    if (evt.type === 'task_completed' && evt.data?.task) {
      const t = evt.data.task;
      tasksMap.set(t.title, { ...t, status: 'completed' });
      renderTasks();
    }

    // Process criteria
    if (evt.type === 'criterion_updated' && evt.data?.criterion) {
      const c = evt.data.criterion;
      criteriaMap.set(c.id, c);
      renderCriteria();
    }

    // Process files
    if (evt.data?.filesChanged && Array.isArray(evt.data.filesChanged)) {
      evt.data.filesChanged.forEach(f => filesSet.add(f));
      renderFiles();
    }

    // Process decisions
    if (evt.type === 'decision' && evt.data?.decision) {
      const d = evt.data.decision;
      decisionsMap.set(d.id, d);
      renderDecisions();
    }

    appendEventToFeed(evt);
  }

  function setStage(stageName, completed = false) {
    Object.keys(stageSteps).forEach(key => {
      stageSteps[key].classList.remove('active', 'completed');
    });
    if (stageSteps[stageName]) {
      stageSteps[stageName].classList.add(completed ? 'completed' : 'active');
    }
  }

  function renderTasks() {
    if (tasksMap.size === 0) return;
    taskCount.textContent = tasksMap.size;
    let html = '';
    tasksMap.forEach(task => {
      const statusClass = task.status || 'pending';
      html += `
        <div class="task-item ${statusClass}">
          <div class="task-header">
            <strong>${escapeHtml(task.title)}</strong>
            <span class="task-status-pill ${statusClass}">${statusClass}</span>
          </div>
          <p style="font-size:0.75rem; color:var(--text-muted);">${escapeHtml(task.description || '')}</p>
        </div>
      `;
    });
    taskList.innerHTML = html;
  }

  function renderCriteria() {
    if (criteriaMap.size === 0) return;
    const verifiedCount = Array.from(criteriaMap.values()).filter(c => c.verified).length;
    criteriaProgress.textContent = `${verifiedCount}/${criteriaMap.size}`;

    let html = '';
    criteriaMap.forEach(crit => {
      const verified = crit.verified;
      html += `
        <div class="criterion-item ${verified ? 'verified' : ''}">
          <div class="${verified ? 'crit-check' : 'crit-pending'}">
            <i class="fa-solid ${verified ? 'fa-circle-check' : 'fa-circle-dot'}"></i>
          </div>
          <div>
            <div>${escapeHtml(crit.description)}</div>
            ${crit.evidence ? `<div style="font-size:0.7rem; color:var(--color-qa); margin-top:2px;">Evidence: ${escapeHtml(crit.evidence)}</div>` : ''}
          </div>
        </div>
      `;
    });
    criteriaList.innerHTML = html;
  }

  function renderFiles() {
    if (filesSet.size === 0) return;
    let html = '';
    filesSet.forEach(file => {
      html += `
        <div class="file-item">
          <i class="fa-solid fa-file-code"></i>
          <span>${escapeHtml(file)}</span>
        </div>
      `;
    });
    filesContainer.innerHTML = html;
  }

  function renderDecisions() {
    if (decisionsMap.size === 0) return;
    let html = '';
    decisionsMap.forEach(dec => {
      html += `
        <div class="decision-item">
          <div class="decision-title">[${dec.type.toUpperCase()}] ${escapeHtml(dec.title)}</div>
          <div style="font-size:0.75rem; color:var(--text-muted);">${escapeHtml(dec.description)}</div>
        </div>
      `;
    });
    decisionsList.innerHTML = html;
  }

  function appendEventToFeed(evt) {
    if (!shouldShowEvent(evt, currentFilter)) return;

    const agentClass = (evt.agent || 'system').toLowerCase();
    const timeStr = new Date(evt.timestamp || Date.now()).toLocaleTimeString();

    const div = document.createElement('div');
    div.className = `feed-event ${agentClass}`;

    let contentHtml = '';
    if (evt.summary) {
      contentHtml += `<div class="event-summary">${escapeHtml(evt.summary)}</div>`;
    }

    if (evt.data?.review?.findings) {
      contentHtml += `<div class="event-body"><strong>Review Findings:</strong><ul>`;
      evt.data.review.findings.forEach(f => {
        contentHtml += `<li><strong>[${f.severity}]</strong> ${escapeHtml(f.issue)} <br><em style="color:var(--color-engineer);">Suggestion: ${escapeHtml(f.suggestion || '')}</em></li>`;
      });
      contentHtml += `</ul></div>`;
    }

    div.innerHTML = `
      <div class="event-meta">
        <span><strong>${escapeHtml(evt.agent || 'System')}</strong> &bull; ${escapeHtml(evt.type || '')}</span>
        <span>${timeStr}</span>
      </div>
      ${contentHtml}
    `;

    feedContainer.appendChild(div);
    feedContainer.scrollTop = feedContainer.scrollHeight;
  }

  function shouldShowEvent(evt, filter) {
    if (filter === 'all') return true;
    if (filter === 'debate') return evt.type.includes('debate') || evt.type.includes('review') || evt.type.includes('critique');
    if (filter === 'tools') return evt.type.includes('tool');
    if (filter === 'qa') return evt.agent === 'QA' || evt.type.includes('criteria') || evt.type.includes('verif');
    return true;
  }

  function renderFeed() {
    feedContainer.innerHTML = '';
    allEvents.forEach(evt => appendEventToFeed(evt));
  }

  function escapeHtml(str) {
    if (typeof str !== 'string') return '';
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
});
