import { test } from 'node:test';
import assert from 'node:assert';
import path from 'path';
import fs from 'fs';
import { toolRegistry } from '../../tools/toolRegistry.js';
import { setupFileTools } from '../../tools/fileTools.js';
import { setupTerminalTools } from '../../tools/terminalTools.js';

test('ToolRegistry & Sandbox - File isolation and permission boundaries', async () => {
  const testWorkspace = path.resolve('./workspaces/test_sandbox');
  if (!fs.existsSync(testWorkspace)) {
    fs.mkdirSync(testWorkspace, { recursive: true });
  }

  setupFileTools(testWorkspace);
  setupTerminalTools(testWorkspace);

  // 1. Write file inside workspace as Engineer
  const writeRes = await toolRegistry.executeTool('write_file', {
    filePath: 'test.txt',
    content: 'Hello Autonomous System'
  }, 'engineer');

  assert.strictEqual(writeRes.success, true);

  // 2. Read file as Reviewer
  const readRes = await toolRegistry.executeTool('read_file', {
    filePath: 'test.txt'
  }, 'reviewer');

  assert.strictEqual(readRes.success, true);
  assert.strictEqual(readRes.output, 'Hello Autonomous System');

  // 3. Permission enforcement: Reviewer cannot write file
  const unauthWrite = await toolRegistry.executeTool('write_file', {
    filePath: 'forbidden.txt',
    content: 'Illegal write'
  }, 'reviewer');

  assert.strictEqual(unauthWrite.success, false);
  assert.match(unauthWrite.error, /permission/i);

  // 4. Path traversal prevention
  const traversalRes = await toolRegistry.executeTool('read_file', {
    filePath: '../../secret.env'
  }, 'engineer');

  assert.strictEqual(traversalRes.success, false);
  assert.match(traversalRes.error, /traversal/i);

  // Clean up
  fs.rmSync(testWorkspace, { recursive: true, force: true });
});
