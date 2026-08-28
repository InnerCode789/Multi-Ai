import { test } from 'node:test';
import assert from 'node:assert';
import { ModelRouter } from '../../providers/modelRouter.js';

test('ModelRouter - Dynamic agent-to-model routing and fallback inspection', () => {
  const router = new ModelRouter();

  // 1. Check routing initialization
  assert.ok(router.agentRouting.planner.provider);
  assert.ok(router.agentRouting.engineer.provider);
  assert.ok(router.agentRouting.reviewer.provider);
  assert.ok(router.agentRouting.qa.provider);

  // 2. Dynamically change routing
  router.setRouting('engineer', 'gemini', 'gemini-3.6-flash');
  assert.strictEqual(router.agentRouting.engineer.provider, 'gemini');
  assert.strictEqual(router.agentRouting.engineer.model, 'gemini-3.6-flash');

  // 3. Provider resolution
  const resolved = router.getProviderForAgent('engineer');
  assert.ok(resolved.provider);
  assert.strictEqual(typeof resolved.provider.getName, 'function');
});
