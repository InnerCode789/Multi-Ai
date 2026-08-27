document.addEventListener('DOMContentLoaded', () => {
    // DOM Elements
    const codeInput = document.getElementById('code-input');
    const languageDropdown = document.getElementById('language-dropdown');
    const startBtn = document.getElementById('start-btn');
    const modeRadios = document.querySelectorAll('input[name="mode"]');
    
    const agentCols = {
        agent1: document.getElementById('agent1-col'),
        agent2: document.getElementById('agent2-col'),
        agent3: document.getElementById('agent3-col')
    };
    
    const agentOutputs = {
        agent1: document.getElementById('agent1-output'),
        agent2: document.getElementById('agent2-output'),
        agent3: document.getElementById('agent3-output')
    };
    
    const statusText = document.querySelector('.status-text');
    const statusDot = document.querySelector('.status-indicator');
    const activeModeSpan = document.getElementById('active-mode');
    const roundProgressSpan = document.getElementById('round-progress');
    const failoverNotice = document.getElementById('failover-notice');

    // Configure Marked to use Highlight.js
    marked.setOptions({
        highlight: function(code, lang) {
            const language = hljs.getLanguage(lang) ? lang : 'plaintext';
            return hljs.highlight(code, { language }).value;
        },
        langPrefix: 'hljs language-',
        breaks: true
    });

    // App State
    let state = {
        isDebating: false,
        currentRound: 0,
        mode: 'cloud',
        abortController: null,
        agentContents: {
            agent1: '',
            agent2: '',
            agent3: ''
        }
    };

    // Event Listeners
    startBtn.addEventListener('click', toggleDebate);
    
    codeInput.addEventListener('keydown', (e) => {
        if (e.ctrlKey && e.key === 'Enter') {
            if (!state.isDebating) toggleDebate();
        }
    });

    modeRadios.forEach(radio => {
        radio.addEventListener('change', (e) => {
            state.mode = e.target.value;
            const chipText = e.target.nextElementSibling.textContent;
            activeModeSpan.textContent = chipText;
        });
    });

    function toggleDebate() {
        if (state.isDebating) {
            stopDebate();
        } else {
            startDebate();
        }
    }

    async function startDebate() {
        const codeSnippet = codeInput.value.trim();
        if (!codeSnippet) {
            alert('Please enter a code snippet or architecture topic to debate.');
            codeInput.focus();
            return;
        }

        // Update UI
        state.isDebating = true;
        startBtn.textContent = '🛑 STOP DEBATE';
        startBtn.style.background = 'linear-gradient(45deg, #ff3355, #ffaa00)';
        clearOutputs();
        updateStatus('Connecting...', 'ready');
        roundProgressSpan.textContent = '1 / 3';
        failoverNotice.style.display = 'none';

        state.abortController = new AbortController();

        try {
            const response = await fetch('/api/arena/stream', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    codeSnippet,
                    language: languageDropdown.value,
                    mode: state.mode,
                    rounds: 3
                }),
                signal: state.abortController.signal
            });

            if (!response.ok) {
                throw new Error(`Server responded with status: ${response.status}`);
            }

            // Stream parsing
            const reader = response.body.getReader();
            const decoder = new TextDecoder('utf-8');
            let buffer = '';

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                buffer += decoder.decode(value, { stream: true });
                let lines = buffer.split('\n');
                buffer = lines.pop() || ''; // Keep the incomplete line in buffer

                let currentEvent = null;
                let currentData = [];

                for (let i = 0; i < lines.length; i++) {
                    const line = lines[i].trim();
                    if (line.startsWith('event:')) {
                        currentEvent = line.substring(6).trim();
                    } else if (line.startsWith('data:')) {
                        currentData.push(line.substring(5).trim());
                    } else if (line === '') {
                        if (currentEvent && currentData.length > 0) {
                            handleStreamEvent(currentEvent, currentData.join('\n'));
                            currentEvent = null;
                            currentData = [];
                        }
                    }
                }
            }
        } catch (err) {
            if (err.name === 'AbortError') {
                updateStatus('Debate stopped by user', 'ready');
            } else {
                console.error('Stream error:', err);
                updateStatus('Error connecting to engine', 'error');
                failoverNotice.textContent = err.message;
                failoverNotice.style.display = 'block';
            }
            finishDebate();
        }
    }

    function stopDebate() {
        if (state.abortController) {
            state.abortController.abort();
        }
    }

    function finishDebate() {
        state.isDebating = false;
        startBtn.textContent = '🥊 START DEBATE';
        startBtn.style.background = '';
        Object.values(agentCols).forEach(col => col.classList.remove('active'));
    }

    function handleStreamEvent(event, dataStr) {
        let data;
        try {
            data = JSON.parse(dataStr);
        } catch (e) {
            data = { text: dataStr };
        }

        switch (event) {
            case 'debate_start':
                updateStatus('Debate in progress', 'ready');
                break;
                
            case 'round_start':
                state.currentRound = data.round;
                roundProgressSpan.textContent = `${data.round} / 3`;
                
                // Highlight active agent based on round
                Object.values(agentCols).forEach(col => col.classList.remove('active'));
                const activeAgentKey = getAgentKeyForRound(data.round);
                agentCols[activeAgentKey].classList.add('active');
                
                // Add round header if not first token of round
                appendToOutput(activeAgentKey, `\n\n### Round ${data.round}\n`);
                break;
                
            case 'token':
                const agentKey = getAgentKeyForRound(state.currentRound);
                if (data.text) {
                    appendToOutput(agentKey, data.text);
                }
                break;
                
            case 'round_end':
                Object.values(agentCols).forEach(col => col.classList.remove('active'));
                break;
                
            case 'failover_notice':
                failoverNotice.textContent = `⚠️ Failover: ${data.message || 'Switched provider'}`;
                failoverNotice.style.display = 'block';
                failoverNotice.classList.add('flash');
                setTimeout(() => failoverNotice.classList.remove('flash'), 3000);
                break;
                
            case 'debate_complete':
                updateStatus('Debate completed', 'ready');
                finishDebate();
                break;
                
            case 'error':
                updateStatus('Error', 'error');
                failoverNotice.textContent = `❌ Error: ${data.message}`;
                failoverNotice.style.display = 'block';
                finishDebate();
                break;
        }
    }

    function getAgentKeyForRound(round) {
        // Round 1 -> agent1, Round 2 -> agent2, Round 3 -> agent3
        // If more rounds, loop back (e.g., Round 4 -> agent1)
        const agentIndex = ((round - 1) % 3) + 1;
        return `agent${agentIndex}`;
    }

    function clearOutputs() {
        state.agentContents = { agent1: '', agent2: '', agent3: '' };
        Object.values(agentOutputs).forEach(div => {
            div.innerHTML = '';
        });
    }

    function updateStatus(text, type) {
        statusText.textContent = text;
        if (type === 'error') {
            statusDot.classList.add('error');
        } else {
            statusDot.classList.remove('error');
        }
    }

    function appendToOutput(agentKey, content) {
        state.agentContents[agentKey] += content;
        
        const outputDiv = agentOutputs[agentKey];
        // Parse markdown and sanitize (in real app, use DOMPurify)
        outputDiv.innerHTML = marked.parse(state.agentContents[agentKey]);
        
        // Auto scroll to bottom
        outputDiv.scrollTop = outputDiv.scrollHeight;
    }
});
