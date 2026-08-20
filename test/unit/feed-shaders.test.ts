// The shader-feed cycle helper (ui/feed-shaders.ts): pure part of the Shader button.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FEED_SHADERS, nextShader } from '../../src/ui/feed-shaders.js';

test('nextShader cycles the shader list and starts it from null', () => {
  assert.equal(nextShader(null), FEED_SHADERS[0]);
  for (let i = 0; i < FEED_SHADERS.length; i++) {
    assert.equal(nextShader(FEED_SHADERS[i]!), FEED_SHADERS[(i + 1) % FEED_SHADERS.length]);
  }
});

test('the shader list is non-empty and duplicate-free', () => {
  assert.ok(FEED_SHADERS.length >= 3);
  assert.equal(new Set(FEED_SHADERS).size, FEED_SHADERS.length);
});
