import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detectWebGPU } from '../../src/gpu/capabilities.js';

test('detectWebGPU reports unavailable when navigator has no gpu (graceful path, ADR-0002)', () => {
  const result = detectWebGPU({} as Navigator);
  assert.equal(result.ok, false);
  assert.ok(result.reason && result.reason.length > 0);
});

test('detectWebGPU reports ok when navigator.gpu is present', () => {
  const fakeNavigator = { gpu: {} } as unknown as Navigator;
  assert.equal(detectWebGPU(fakeNavigator).ok, true);
});
