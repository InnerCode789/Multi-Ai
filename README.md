# 🥊 ArchitectArena Hybrid

```text
    _             _     _ _            _      _                       
   / \   _ __ ___| |__ (_) |_ ___  ___| |_   / \   _ __ ___ _ __   __ _ 
  / _ \ | '__/ __| '_ \| | __/ _ \/ __| __| / _ \ | '__/ _ \ '_ \ / _` |
 / ___ \| | | (__| | | | | ||  __/ (__| |_ / ___ \| | |  __/ | | | (_| |
/_/   \_\_|  \___|_| |_|_|\__\___|\___|\__/_/   \_\_|  \___|_| |_|\__,_|
```

![Node.js](https://img.shields.io/badge/Node.js-18+-green.svg)
![License](https://img.shields.io/badge/license-MIT-blue.svg)
![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)

ArchitectArena Hybrid is a Tri-Mode AI Architecture Debate Engine. It allows users to submit software architecture concepts, code snippets, or technical dilemmas and watch three specialized AI agents debate the pros and cons in real-time.

## 🌟 Features

- **🤖 Tri-Agent Debate**: Three distinct personas evaluate your code:
  - ⚡ **Performance Purist**: Focuses on speed, efficiency, and scale.
  - 🛡️ **Security Auditor**: Hunts for vulnerabilities and compliance issues.
  - 👨‍⚖️ **Chief Architect**: Balances trade-offs and synthesizes a final verdict.
- **🔄 Hybrid Engine (3 Modes)**:
  - ⚡ **Cloud APIs**: Uses premium LLMs (OpenAI/Anthropic) for high-quality reasoning.
  - 💻 **Local Ollama**: Privacy-first, zero-cost local inference via Ollama.
  - 🕷️ **Web Scraper (Fallback)**: Experimental headless browser scraping for API-less remote evaluation.
- **🛡️ Auto-Failover**: Automatically falls back to alternative modes if the primary provider goes down.
- **🌊 Real-time SSE Streaming**: Watch the debate unfold token-by-token in a cyber-themed UI.
- **🎨 Markdown & Code Highlighting**: Beautifully rendered agent responses with syntax highlighting.

## 🏗️ Architecture

```text
[ Web Client (SSE) ]  <--->  [ Express Server ]
                                  |
                                  +--> Mode: Cloud API (OpenAI/Anthropic)
                                  |
                                  +--> Mode: Local Ollama (llama3/mistral)
                                  |
                                  +--> Mode: Web Scraper (Puppeteer Fallback)
```

## 🚀 Quick Start

### Prerequisites
- Node.js (v18+)
- (Optional) Ollama installed locally for `local` mode
- API Keys for Cloud providers (if using `cloud` mode)

### Installation

1. **Clone the repository:**
   ```bash
   git clone https://github.com/yourusername/architect-arena-hybrid.git
   cd architect-arena-hybrid
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Configure Environment:**
   Create a `.env` file in the root directory:
   ```env
   PORT=3000
   OPENAI_API_KEY=your_openai_key_here
   ANTHROPIC_API_KEY=your_anthropic_key_here
   OLLAMA_URL=http://localhost:11434
   ```

4. **Start the Development Server:**
   ```bash
   npm run dev
   ```

5. **Open in Browser:**
   Navigate to `http://localhost:3000`

## 🔌 API Reference

### POST `/api/arena/stream`
Initiates a debate and streams back Server-Sent Events (SSE).

**Request Body (JSON):**
```json
{
  "codeSnippet": "function bubbleSort(arr) { ... }",
  "language": "javascript",
  "mode": "auto",
  "rounds": 3
}
```

**SSE Event Types:**

| Event Type | Description | Data Payload Example |
|------------|-------------|----------------------|
| `debate_start` | Marks the beginning of the debate | `{"message": "Debate initialized"}` |
| `round_start` | Indicates a new agent is speaking | `{"round": 1, "agent": "purist"}` |
| `token` | Streaming text chunk from the active agent | `{"text": " The performance is..."}` |
| `round_end` | Agent has finished speaking | `{"round": 1}` |
| `failover_notice`| Sent when engine falls back to another mode | `{"message": "Cloud failed, using Local"}` |
| `debate_complete`| Debate has finished successfully | `{"status": "success"}` |
| `error` | Fatal error occurred | `{"message": "Connection refused"}` |

## ⚙️ Mode Configuration

- **Cloud Mode (`cloud`)**: Uses official REST APIs (OpenAI/Anthropic). Requires valid `.env` keys. Best for complex architectural queries.
- **Local Mode (`local`)**: Routes requests to a local Ollama instance. Set `OLLAMA_URL` in `.env`. Best for offline usage or proprietary code.
- **Scraper Mode (`scraper`)**: Experimental fallback that uses Puppeteer to scrape free AI chat interfaces. Can be slow and brittle.
- **Auto Mode (`auto`)**: Tries Cloud first, falls back to Local if API keys are missing/exhausted, and finally attempts Scraper as a last resort.

## 🌐 Deployment (Render.com)

This project includes a `render.yaml` for easy deployment on Render.

1. Fork this repository.
2. Log into Render.com and create a new "Blueprint Instance".
3. Connect your fork and Render will automatically provision the Node.js web service.
4. Ensure you set your Environment Variables (API Keys) in the Render Dashboard.

*Note: Scraper mode requires a Puppeteer buildpack on Render.*

## 🛠️ Tech Stack

- **Frontend**: HTML5, CSS3 (CSS Variables, Grid, Flexbox), Vanilla JavaScript
- **Syntax Highlighting**: Highlight.js
- **Markdown Parsing**: Marked.js
- **Backend**: Node.js, Express.js
- **Streaming**: Server-Sent Events (SSE)
- **Fallback Scraping**: Puppeteer (optional)

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.