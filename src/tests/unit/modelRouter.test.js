import { test } from 'node:test';
import assert from 'node:assert';
import { ModelRouter } from '../../providers/modelRouter.js';

test('ModelRouter - Local-only routing and provider isolation', async () => {
  const router = new ModelRouter();

  // 1. Check all agents routed to Ollama in local mode
  assert.strictEqual(router.agentRouting.planner.provider, 'ollama');
  assert.strictEqual(router.agentRouting.engineer.provider, 'ollama');
  assert.strictEqual(router.agentRouting.reviewer.provider, 'ollama');
  assert.strictEqual(router.agentRouting.qa.provider, 'ollama');

  // 2. Check provider resolution
  const resolvedEngineer = router.getProviderForAgent('engineer');
  assert.strictEqual(resolvedEngineer.providerName, 'ollama');
  assert.strictEqual(resolvedEngineer.provider.getName(), 'Ollama');

  const resolvedQA = router.getProviderForAgent('qa');
  assert.strictEqual(resolvedQA.providerName, 'ollama');

  // 3. Dynamically change routing within Ollama
  router.setRouting('engineer', 'ollama', 'deepseek-r1:7b');
  assert.strictEqual(router.agentRouting.engineer.provider, 'ollama');
  assert.strictEqual(router.agentRouting.engineer.model, 'deepseek-r1:7b');

  // 4. Verify local provider verification method exists
  assert.strictEqual(typeof router.verifyLocalProvider, 'function');
});
