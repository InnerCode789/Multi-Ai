// Configure marked with highlight.js
marked.setOptions({
  highlight: function (code, lang) {
    const language = hljs.getLanguage(lang) ? lang : 'plaintext';
    return hljs.highlight(code, { language }).value;
  },
  langPrefix: 'hljs language-',
});

// State
const state = {
  isDebating: false,
  currentRound: 0,
  mode: 'standard',
  abortController: null,
  agentContents: {
    agent1: '',
    agent2: '',
    agent3: ''
  }
};

// DOM Elements
const els = {
  codeEditor: document.getElementById('code-editor'),
  modeDropdown: document.getElementById('mode-dropdown'),
  startBtn: document.getElementById('start-btn'),
  stopBtn: document.getElementById('stop-btn'),
  clearBtn: document.getElementById('clear-btn'),
  copyBtn: document.getElementById('copy-btn'),
  
  agent1Output: document.getElementById('agent1-output'),
  agent2Output: document.getElementById('agent2-output'),
  agent3Output: document.getElementById('agent3-output'),
  
  agent1Typing: document.getElementById('agent1-typing'),
  agent2Typing: document.getElementById('agent2-typing'),
  agent3Typing: document.getElementById('agent3-typing'),
  
  statusText: document.querySelector('.status-text'),
  statusDot: document.querySelector('.status-indicator .status-dot'),
  activeMode: document.getElementById('active-mode'),
  roundProgress: document.getElementById('round-progress'),
  failoverNotice: document.getElementById('failover-notice')
};

// Event Listeners
els.startBtn.addEventListener('click', startDebate);
els.stopBtn.addEventListener('click', stopDebate);
els.clearBtn.addEventListener('click', clearOutputs);
els.copyBtn.addEventListener('click', copyFinalCode);
els.modeDropdown.addEventListener('change', (e) => {
  els.activeMode.textContent = e.target.options[e.target.selectedIndex].text;
});
els.codeEditor.addEventListener('keydown', (e) => {
  if (e.ctrlKey && e.key === 'Enter') {
    startDebate();
  }
});

// Setup
els.activeMode.textContent = els.modeDropdown.options[els.modeDropdown.selectedIndex].text;
els.copyBtn.style.display = 'none';

async function startDebate() {
  const code = els.codeEditor.value.trim();
  if (!code) {
    alert("Please enter some code to review.");
    return;
  }

  if (state.isDebating) return;

  clearOutputs();
  state.isDebating = true;
  state.mode = els.modeDropdown.value;
  state.abortController = new AbortController();
  
  updateUIForDebate(true);
  updateStatusBar("Debate starting...", "running");
  
  try {
    const response = await fetch('/api/arena/stream', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code, mode: state.mode }),
      signal: state.abortController.signal
    });

    if (!response.ok) {
      throw new Error(`Server error: ${response.status}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop();

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const dataStr = line.slice(6).trim();
          if (!dataStr || dataStr === '[DONE]') continue;
          
          try {
            const eventData = JSON.parse(dataStr);
            handleSSEEvent(eventData);
          } catch (err) {
            console.error("Error parsing SSE data:", err, dataStr);
          }
        }
      }
    }
  } catch (err) {
    if (err.name === 'AbortError') {
      updateStatusBar("Debate cancelled by user", "stopped");
    } else {
      updateStatusBar(`Error: ${err.message}`, "error");
      console.error(err);
    }
    stopDebate(false);
  }
}

function handleSSEEvent(eventData) {
  // Support both {event, data} structure and {type, ...data} structure
  const event = eventData.event || eventData.type;
  const data = eventData.data || eventData;

  switch (event) {
    case 'init':
      updateStatusBar("Debate in progress", "running");
      els.roundProgress.textContent = "Round 0/3";
      break;
    case 'round1_perf':
      els.roundProgress.textContent = "Round 1/3 - Performance";
      setTyping('agent1');
      appendToOutput('agent1', data.content);
      break;
    case 'round2_sec':
      els.roundProgress.textContent = "Round 2/3 - Security";
      setTyping('agent2');
      appendToOutput('agent2', data.content);
      break;
    case 'final_verdict':
      els.roundProgress.textContent = "Round 3/3 - Final Verdict";
      setTyping('agent3');
      appendToOutput('agent3', data.content);
      break;
    case 'done':
      updateStatusBar(`Complete! Time: ${(data.totalTimeMs/1000).toFixed(1)}s, Words: ${data.totalWords}`, "stopped");
      setTyping(null);
      stopDebate(false);
      els.copyBtn.style.display = 'inline-block';
      break;
    case 'error':
      updateStatusBar(`Error: ${data.message}`, "error");
      setTyping(null);
      stopDebate(false);
      break;
    case 'failover_notice':
      showFailover(data.message || `Switched from ${data.from} to ${data.to}`);
      break;
  }
}

function setTyping(agentId) {
  els.agent1Typing.style.display = agentId === 'agent1' ? 'inline-block' : 'none';
  els.agent2Typing.style.display = agentId === 'agent2' ? 'inline-block' : 'none';
  els.agent3Typing.style.display = agentId === 'agent3' ? 'inline-block' : 'none';
}

function stopDebate(doAbort = true) {
  if (doAbort && state.abortController) {
    state.abortController.abort();
  }
  state.isDebating = false;
  state.abortController = null;
  setTyping(null);
  updateUIForDebate(false);
}

function clearOutputs() {
  state.agentContents = { agent1: '', agent2: '', agent3: '' };
  els.agent1Output.innerHTML = '';
  els.agent2Output.innerHTML = '';
  els.agent3Output.innerHTML = '';
  els.copyBtn.style.display = 'none';
  els.roundProgress.textContent = 'Ready';
  updateStatusBar("Ready", "stopped");
}

function appendToOutput(agentId, content) {
  if (!content) return;
  state.agentContents[agentId] += content;
  const targetEl = els[`${agentId}Output`];
  targetEl.innerHTML = marked.parse(state.agentContents[agentId]);
  targetEl.scrollTop = targetEl.scrollHeight;
}

function updateStatusBar(text, stateType) {
  els.statusText.textContent = text;
  
  els.statusDot.classList.remove('status-stopped', 'status-running', 'status-error');
  
  if (stateType === 'running') {
    els.statusDot.classList.add('status-running');
  } else if (stateType === 'error') {
    els.statusDot.classList.add('status-error');
  } else {
    els.statusDot.classList.add('status-stopped');
  }
}

function updateUIForDebate(isDebating) {
  els.startBtn.disabled = isDebating;
  els.stopBtn.disabled = !isDebating;
  els.clearBtn.disabled = isDebating;
  els.modeDropdown.disabled = isDebating;
}

function showFailover(msg) {
  els.failoverNotice.textContent = msg;
  els.failoverNotice.style.display = 'inline-block';
  setTimeout(() => {
    els.failoverNotice.style.display = 'none';
  }, 5000);
}

function copyFinalCode() {
  const verdictEl = els.agent3Output;
  const preElements = verdictEl.querySelectorAll('pre code');
  
  let textToCopy = '';
  if (preElements && preElements.length > 0) {
    const codes = Array.from(preElements).map(el => el.textContent);
    textToCopy = codes.join('\n\n');
  } else {
    textToCopy = state.agentContents.agent3;
  }
  
  if (!textToCopy) return;

  navigator.clipboard.writeText(textToCopy).then(() => {
    const originalText = els.copyBtn.textContent;
    els.copyBtn.textContent = 'Copied!';
    setTimeout(() => {
      els.copyBtn.textContent = originalText;
    }, 2000);
  }).catch(err => {
    console.error('Failed to copy', err);
  });
}
