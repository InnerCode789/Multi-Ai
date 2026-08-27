import { z } from 'zod';
import { setupSSE, sendSSE, startHeartbeat, stopHeartbeat } from '../utils/sseHelper.js';
import logger from '../utils/logger.js';
import dispatcher from '../providers/index.js';
import * as perfAgent from '../prompts/performanceAgent.js';
import * as secAgent from '../prompts/securityAgent.js';
import * as refAgent from '../prompts/refereeAgent.js';
import config from '../config/env.js';

const requestSchema = z.object({
  codeSnippet: z.string().min(1, "Code snippet is required"),
  language: z.string().default("javascript"),
  mode: z.enum(['cloud', 'local', 'scraper', 'hybrid']).default('hybrid'),
  rounds: z.number().int().min(1).max(3).default(3)
});

export const runDebate = async (req, res) => {
  // Ensure the exact headers are set
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  setupSSE(res);

  let heartbeatInterval;
  let clientDisconnected = false;

  req.on('close', () => {
    clientDisconnected = true;
    if (heartbeatInterval) {
      stopHeartbeat(heartbeatInterval);
    }
    logger.info("Client disconnected during debate");
    res.end();
  });

  const startTime = Date.now();
  let totalWords = 0;
  const providersUsed = new Set();

  const countWords = (str) => {
    if (!str) return 0;
    return str.split(/\s+/).filter(w => w.length > 0).length;
  };

  try {
    // We assume the data is coming in via query params or body, preferring body for large code
    const inputData = req.body || req.query;
    const validatedData = requestSchema.parse(inputData);
    const { codeSnippet, language, mode, rounds } = validatedData;

    sendSSE(res, 'init', { mode, language, rounds });

    // Start sending ping/heartbeat events
    heartbeatInterval = startHeartbeat(res);

    const processStream = async (stream, eventName) => {
      let fullResponse = "";
      for await (const chunk of stream) {
        if (clientDisconnected) break;

        if (chunk.failover || chunk.event === 'failover_notice') {
          sendSSE(res, 'failover_notice', { message: chunk.message || 'Provider failover triggered' });
          continue;
        }

        if (chunk.provider) {
          providersUsed.add(chunk.provider);
        }

        if (chunk.chunk) {
          fullResponse += chunk.chunk;
          totalWords += countWords(chunk.chunk);
          sendSSE(res, eventName, { content: chunk.chunk });
        }
      }
      return fullResponse;
    };

    // Round 1: Performance Agent
    const perfPrompt = perfAgent.buildPrompt(codeSnippet, language);
    const perfStream = dispatcher.streamWithFailover(mode, perfAgent.SYSTEM_PROMPT, perfPrompt, {});
    const perfResponse = await processStream(perfStream, 'round1_perf');

    if (clientDisconnected) return;

    // Round 2: Security Agent
    let secResponse = "";
    if (rounds >= 2) {
      const secPrompt = secAgent.buildPrompt(codeSnippet, language, perfResponse);
      const secStream = dispatcher.streamWithFailover(mode, secAgent.SYSTEM_PROMPT, secPrompt, {});
      secResponse = await processStream(secStream, 'round2_sec');
    }

    if (clientDisconnected) return;

    // Final Round: Referee (Chief Architect)
    if (rounds >= 3) {
      const refPrompt = refAgent.buildPrompt(codeSnippet, language, perfResponse, secResponse);
      const refStream = dispatcher.streamWithFailover(mode, refAgent.SYSTEM_PROMPT, refPrompt, {});
      await processStream(refStream, 'final_verdict');
    }

    if (clientDisconnected) return;

    const totalTimeMs = Date.now() - startTime;
    sendSSE(res, 'done', {
      totalTimeMs,
      totalWords,
      providersUsed: Array.from(providersUsed),
      mode
    });

  } catch (error) {
    logger.error(`Error in runDebate: ${error.message}`);
    if (!clientDisconnected) {
      sendSSE(res, 'error', { message: error.message });
    }
  } finally {
    if (heartbeatInterval) stopHeartbeat(heartbeatInterval);
    if (!clientDisconnected) {
      res.end();
    }
  }
};
