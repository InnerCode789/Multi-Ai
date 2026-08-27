import { test } from 'node:test';
import assert from 'node:assert';
import { ModelRouter } from '../../providers/modelRouter.js';

test('ModelRouter - Dynamic agent-to-model routing and fallback inspection', () => {
  const router = new ModelRouter();

  // 1. Check default routing
  assert.strictEqual(router.agentRouting.planner.provider, 'gemini');
  assert.strictEqual(router.agentRouting.engineer.provider, 'groq');
  assert.strictEqual(router.agentRouting.reviewer.provider, 'github-models');
  assert.strictEqual(router.agentRouting.qa.provider, 'gemini');

  // 2. Dynamically change routing
  router.setRouting('engineer', 'gemini', 'gemini-2.5-flash');
  assert.strictEqual(router.agentRouting.engineer.provider, 'gemini');
  assert.strictEqual(router.agentRouting.engineer.model, 'gemini-2.5-flash');

  // 3. Provider resolution
  const resolved = router.getProviderForAgent('engineer');
  assert.ok(resolved.provider);
  assert.strictEqual(typeof resolved.provider.getName, 'function');
});
