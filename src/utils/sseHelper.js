export function setupSSE(res) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no'
  });
  res.flushHeaders();
}

export function sendSSE(res, event, data, id) {
  if (id) {
    res.write(`id: ${id}\n`);
  }
  if (event) {
    res.write(`event: ${event}\n`);
  }
  res.write(`data: ${typeof data === 'string' ? data : JSON.stringify(data)}\n\n`);
}

export function sendHeartbeat(res) {
  res.write(': keepalive\n\n');
}

export function startHeartbeat(res, intervalMs = 15000) {
  return setInterval(() => {
    sendHeartbeat(res);
  }, intervalMs);
}

export function stopHeartbeat(intervalId) {
  if (intervalId) {
    clearInterval(intervalId);
  }
}
