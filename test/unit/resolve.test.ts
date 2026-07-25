import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveBusSource, busAudioSource, usesMatte } from '../../src/core/resolve.js';
import type { BusState } from '../../src/state/state.js';
import type { ResolveContext } from '../../src/core/resolve.js';

const bus = (source: BusState['source'], substituteSource: 1 | 2 | 3 | 4 = 1): BusState => ({
  source,
  substituteSource,
});

const CONTEXTS: ResolveContext[] = ['mixWipe', 'key', 'dsk', 'fade', 'directOut'];

test('a non-Matte source resolves identically for every context (ADR-0006)', () => {
  for (const context of CONTEXTS) {
    assert.equal(resolveBusSource(bus(2), context), 2);
  }
});

test('Matte resolves to Matte only for mixWipe; substitutes elsewhere', () => {
  const b = bus('matte', 3);
  assert.equal(resolveBusSource(b, 'mixWipe'), 'matte');
  for (const context of ['key', 'dsk', 'fade', 'directOut'] as ResolveContext[]) {
    assert.equal(resolveBusSource(b, context), 3, `context ${context} should substitute`);
  }
});

test('usesMatte is true only when the resolver returns Matte', () => {
  assert.equal(usesMatte(bus('matte', 3), 'mixWipe'), true);
  assert.equal(usesMatte(bus('matte', 3), 'dsk'), false);
  assert.equal(usesMatte(bus(1), 'mixWipe'), false);
});

test('busAudioSource follows the selection; Matte yields no bus audio', () => {
  assert.equal(busAudioSource(bus(4)), 4);
  assert.equal(busAudioSource(bus('matte', 2)), null);
});
