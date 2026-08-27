import { z } from 'zod';
import { setupSSE, sendSSE, startHeartbeat, stopHeartbeat } from '../utils/sseHelper.js';
import logger from '../utils/logger.js';
import dispatcher from '../providers/index.js';
import * as perfAgent from '../prompts/performanceAgent.js';
import * as secAgent from '../prompts/securityAgent.js';
import * as refAgent from '../prompts/refereeAgent.js';
import config from '../config/env.js';

const requestSchema = z.object({
  codeSnippet: z.string().min(1).max(10000),
  language: z.string().default('javascript'),
  mode: z.enum(['cloud', 'local', 'scraper', 'auto']).default(config?.defaultMode || 'auto'),
  rounds: z.number().int().min(1).max(5).default(3)
});

export async function handleArenaStream(req, res) {
  let heartbeatInterval;
  
  try {
    const parseResult = requestSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({ error: 'Invalid request', details: parseResult.error.errors });
    }

    const { codeSnippet, language, mode, rounds } = parseResult.data;

    setupSSE(res);
    startHeartbeat(res);

    sendSSE(res, 'debate_start', { mode, language, rounds });

    const responses = {};
    let activeMode = mode;
    const abortController = new AbortController();

    req.on('close', () => {
      logger.info('Client closed connection, aborting provider streams.');
      abortController.abort();
    });

    // Round 1 - Performance Purist
    sendSSE(res, 'round_start', { round: 1, agent: 'Performance Purist', role: 'performance' });
    const perfPrompt = perfAgent.buildPrompt(codeSnippet, language, null);
    const perfFullPrompt = perfAgent.SYSTEM_PROMPT + '\n\n' + perfPrompt;
    let perfResponseText = '';

    for await (const chunk of dispatcher.streamWithFailover(activeMode, 'performance', perfFullPrompt, { signal: abortController.signal })) {
      sendSSE(res, 'token', { round: 1, content: chunk.chunk });
      perfResponseText += chunk.chunk;
      if (chunk.failover) {
        sendSSE(res, 'failover_notice', { from: chunk.failover.from, to: chunk.failover.to });
        activeMode = chunk.failover.to;
      }
    }
    responses.performance = perfResponseText;
    sendSSE(res, 'round_end', { round: 1, agent: 'Performance Purist' });

    // Round 2 - Security Auditor
    sendSSE(res, 'round_start', { round: 2, agent: 'Security Auditor', role: 'security' });
    const secPrompt = secAgent.buildPrompt(codeSnippet, language, responses.performance);
    const secFullPrompt = secAgent.SYSTEM_PROMPT + '\n\n' + secPrompt;
    let secResponseText = '';

    for await (const chunk of dispatcher.streamWithFailover(activeMode, 'security', secFullPrompt, { signal: abortController.signal })) {
      sendSSE(res, 'token', { round: 2, content: chunk.chunk });
      secResponseText += chunk.chunk;
      if (chunk.failover) {
        sendSSE(res, 'failover_notice', { from: chunk.failover.from, to: chunk.failover.to });
        activeMode = chunk.failover.to;
      }
    }
    responses.security = secResponseText;
    sendSSE(res, 'round_end', { round: 2, agent: 'Security Auditor' });

    // Final Round - Chief Architect
    sendSSE(res, 'round_start', { round: 3, agent: 'Chief Architect', role: 'referee' });
    const refPrompt = refAgent.buildPrompt(codeSnippet, language, responses.performance, responses.security);
    const refFullPrompt = refAgent.SYSTEM_PROMPT + '\n\n' + refPrompt;
    let refResponseText = '';

    for await (const chunk of dispatcher.streamWithFailover(activeMode, 'referee', refFullPrompt, { signal: abortController.signal })) {
      sendSSE(res, 'token', { round: 3, content: chunk.chunk });
      refResponseText += chunk.chunk;
      if (chunk.failover) {
        sendSSE(res, 'failover_notice', { from: chunk.failover.from, to: chunk.failover.to });
        activeMode = chunk.failover.to;
      }
    }
    responses.referee = refResponseText;
    sendSSE(res, 'round_end', { round: 3, agent: 'Chief Architect' });

    sendSSE(res, 'debate_complete', { summary: 'Debate successfully concluded.', totalRounds: 3 });

  } catch (error) {
    logger.error('Arena controller error:', error);
    if (!res.headersSent) {
      return res.status(500).json({ error: error.message });
    } else {
      sendSSE(res, 'error', { message: error.message });
    }
  } finally {
    stopHeartbeat(res);
    if (!res.writableEnded) {
      res.end();
    }
  }
}
