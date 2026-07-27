import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FACTORY_PRESET, panelSnapshot } from '../../src/state/state.js';
import type { PanelSnapshot, PanelState } from '../../src/state/state.js';
import { MemoryStorageBackend } from '../../src/persistence/backend.js';
import { KEY_BANK } from '../../src/persistence/schema.js';
import { createPersistence } from '../../src/persistence/persistence.js';

const fresh = (): PanelState => structuredClone(FACTORY_PRESET);
const snap = (): PanelSnapshot => panelSnapshot(fresh());

test('the Event Memory bank round-trips across a simulated reload (same storage, fresh module)', () => {
  const storage = new MemoryStorageBackend();
  const bank: (PanelSnapshot | null)[] = [snap(), null, snap(), null, null, null, null, null];
  createPersistence(storage).saveBank(bank);
  // fresh module + fresh engine boot from the SAME backing store
  const reloaded = createPersistence(storage);
  const restored = reloaded.restoreOnBoot();
  assert.deepEqual(restored.memory.slots, bank);
  assert.notEqual(storage.get(KEY_BANK), null, 'bank read back synchronously from storage');
});

test('a normal boot with no saved data comes up on the factory preset (Reset ON)', () => {
  const p = createPersistence(new MemoryStorageBackend());
  const state = p.restoreOnBoot();
  assert.equal(state.system.reset, 'on');
  assert.equal(state.specialMode.active, false);
  assert.deepEqual(
    state.memory.slots,
    [null, null, null, null, null, null, null, null],
  );
});

test('Reset OFF restores the field preset with Still/Strobe/Special stripped', () => {
  const storage = new MemoryStorageBackend();
  const p = createPersistence(storage);
  p.saveSettings({ reset: 'off' });
  const dirty = fresh();
  dirty.digitalEffect.freeze.still = true;
  dirty.specialMode = { ...dirty.specialMode, active: true };
  dirty.transition.type = 'nam';
  p.captureFieldPreset(dirty);
  const restored = createPersistence(storage).restoreOnBoot();
  assert.equal(restored.transition.type, 'nam', 'panel setup restored');
  assert.equal(restored.digitalEffect.freeze.still, false, 'Still not restored');
  assert.equal(restored.specialMode.active, false, 'Special Mode not restored');
});

test('a corrupt / future-version / missing payload falls back to empty, never throws', () => {
  const storage = new MemoryStorageBackend();
  storage.set(KEY_BANK, '{ not valid json');
  const p = createPersistence(storage);
  assert.doesNotThrow(() => p.loadBank());
  assert.deepEqual(p.loadBank(), [null, null, null, null, null, null, null, null]);
  storage.set(KEY_BANK, JSON.stringify({ schemaVersion: 999, data: [snap()] }));
  assert.deepEqual(p.loadBank(), [null, null, null, null, null, null, null, null], 'future version discarded');
});

test('clearBank empties the bank', () => {
  const storage = new MemoryStorageBackend();
  const p = createPersistence(storage);
  p.saveBank([snap(), snap(), null, null, null, null, null, null]);
  p.clearBank();
  assert.deepEqual(p.loadBank(), [null, null, null, null, null, null, null, null]);
});

test('exportPreset / importPreset round-trip the bank and reject bad input', () => {
  const source = new MemoryStorageBackend();
  const p = createPersistence(source);
  p.saveBank([snap(), null, snap(), null, null, null, null, null]);
  const json = p.exportPreset({ kind: 'bank' });

  const target = new MemoryStorageBackend();
  const q = createPersistence(target);
  assert.deepEqual(q.importPreset(json), { ok: true });
  assert.deepEqual(q.loadBank(), p.loadBank());

  assert.deepEqual(q.importPreset('nonsense{'), { ok: false, reason: 'corrupt' });
  assert.deepEqual(
    q.importPreset(JSON.stringify({ schemaVersion: 999, target: 'bank', data: [] })),
    { ok: false, reason: 'unsupported-version' },
  );
});
