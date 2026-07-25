import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PanelStore } from '../../src/state/store.js';
import { FACTORY_PRESET } from '../../src/state/state.js';

function freshStore(): PanelStore {
  return new PanelStore(structuredClone(FACTORY_PRESET));
}

test('starts at the provided initial snapshot', () => {
  const store = freshStore();
  assert.equal(store.getSnapshot().busA.source, 1);
});

test('dispatch produces a new immutable snapshot; the previous one is unchanged', () => {
  const store = freshStore();
  const before = store.getSnapshot();
  store.dispatch({ type: 'ASSIGN_SOURCE', bus: 'A', source: 3 });
  const after = store.getSnapshot();

  assert.notEqual(before, after); // new object identity
  assert.equal(before.busA.source, 1); // old snapshot untouched
  assert.equal(after.busA.source, 3);
});

test('subscribers receive next and prev snapshots; unsubscribe stops them', () => {
  const store = freshStore();
  const calls: Array<{ next: number; prev: number }> = [];
  const unsubscribe = store.subscribe((next, prev) => {
    calls.push({ next: next.transition.lever, prev: prev.transition.lever });
  });

  store.dispatch({ type: 'SET_LEVER', position: 0.5 });
  unsubscribe();
  store.dispatch({ type: 'SET_LEVER', position: 1 });

  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0], { next: 0.5, prev: 0 });
});

test('a no-op command notifies nobody', () => {
  const store = freshStore();
  let notified = 0;
  store.subscribe(() => notified++);
  store.dispatch({ type: 'ASSIGN_SOURCE', bus: 'A', source: 1 }); // already 1
  assert.equal(notified, 0);
});

test('LOAD_STATE replaces the whole panel', () => {
  const store = freshStore();
  const replacement = structuredClone(FACTORY_PRESET);
  replacement.busB.source = 'matte';
  store.dispatch({ type: 'LOAD_STATE', state: replacement });
  assert.equal(store.getSnapshot().busB.source, 'matte');
});
