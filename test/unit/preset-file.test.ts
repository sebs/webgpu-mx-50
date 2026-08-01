import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MemoryStorageBackend } from '../../src/persistence/backend.js';
import { createPersistence } from '../../src/persistence/persistence.js';
import { attachPersistence } from '../../src/persistence/subscriber.js';
import { PanelStore } from '../../src/state/store.js';
import { FACTORY_PRESET, panelSnapshot } from '../../src/state/state.js';
import {
  exportFeedback,
  importFeedback,
  presetFileName,
  stampFromDate,
  MAX_IMPORT_BYTES,
} from '../../src/persistence/preset-file.js';

test('presetFileName pads and formats the stamp', () => {
  assert.equal(presetFileName('bank', { year: 2026, month: 8, day: 1, hour: 9, minute: 5 }), 'mx50-bank-20260801-0905.json');
  assert.ok(presetFileName('fieldPreset', { year: 2026, month: 12, day: 31, hour: 23, minute: 59 }).indexOf('mx50-field-preset-') === 0);
  assert.ok(presetFileName('settings', { year: 2026, month: 1, day: 2, hour: 0, minute: 0 }).indexOf('mx50-settings-') === 0);
  assert.equal(presetFileName('bank', { year: 2026, month: 8, day: 1, hour: 14, minute: 32 }).indexOf(':'), -1);
});

test('stampFromDate projects local time (1-based month)', () => {
  assert.deepEqual(stampFromDate(new Date(2026, 7, 1, 9, 5)), { year: 2026, month: 8, day: 1, hour: 9, minute: 5 });
});

test('importFeedback covers every outcome distinctly', () => {
  const lines = [
    importFeedback({ ok: true, target: 'bank' }, 3),
    importFeedback({ ok: true, target: 'fieldPreset' }),
    importFeedback({ ok: true, target: 'settings' }),
    importFeedback({ ok: false, reason: 'corrupt' }),
    importFeedback({ ok: false, reason: 'unsupported-version' }),
    importFeedback({ ok: false, reason: 'read-error' }),
    importFeedback({ ok: false, reason: 'too-large' }),
    importFeedback({ ok: false, reason: 'storage-full' }),
  ];
  assert.ok(lines[0]!.indexOf('3') !== -1);
  assert.ok(lines[1]!.indexOf('Reset OFF') !== -1);
  for (const failed of lines.slice(3)) assert.ok(failed.indexOf('Import failed') === 0);
  assert.equal(new Set(lines).size, lines.length);
  assert.ok(MAX_IMPORT_BYTES > 1024 * 1024);
});

test('exportFeedback names the file', () => {
  assert.ok(exportFeedback('bank', 'x.json').indexOf('x.json') !== -1);
});

test('importPreset tags the target for settings and fieldPreset files', () => {
  const a = createPersistence(new MemoryStorageBackend());
  a.saveSettings({ reset: 'off' });
  a.captureFieldPreset(structuredClone(FACTORY_PRESET));
  const b = createPersistence(new MemoryStorageBackend());
  assert.deepEqual(b.importPreset(a.exportPreset({ kind: 'settings' })), { ok: true, target: 'settings' });
  assert.equal(b.loadSettings().reset, 'off');
  assert.deepEqual(b.importPreset(a.exportPreset({ kind: 'fieldPreset' })), { ok: true, target: 'fieldPreset' });
  assert.deepEqual(b.readFieldPreset(), a.readFieldPreset());
});

test('an imported bank goes live through LOAD_BANK and the subscriber re-mirrors it', () => {
  const a = createPersistence(new MemoryStorageBackend());
  const snap = panelSnapshot(structuredClone(FACTORY_PRESET));
  a.saveBank([snap, null, snap, null, null, null, null, null]);
  const json = a.exportPreset({ kind: 'bank' });

  const backend = new MemoryStorageBackend();
  const b = createPersistence(backend);
  const store = new PanelStore(structuredClone(FACTORY_PRESET));
  attachPersistence(store, b);
  const result = b.importPreset(json);
  assert.deepEqual(result, { ok: true, target: 'bank' });
  store.dispatch({ type: 'LOAD_BANK', slots: b.loadBank() });
  assert.deepEqual(store.getSnapshot().memory.slots, a.loadBank());
  assert.deepEqual(b.loadBank(), a.loadBank()); // idempotent re-save, storage not clobbered
});

// --- review-fix regressions ---------------------------------------------------

test('a bank import strips still references (stills do not travel; keys are not machine-unique)', () => {
  const backendA = new MemoryStorageBackend();
  const a = createPersistence(backendA);
  const snap = panelSnapshot(structuredClone(FACTORY_PRESET));
  const withStill = structuredClone(snap);
  withStill.positioner = { ...withStill.positioner, sceneGrabber: true, stillId: 'still:1' };
  a.saveBank([withStill, null, null, null, null, null, null, null]);
  const b = createPersistence(new MemoryStorageBackend());
  assert.deepEqual(b.importPreset(a.exportPreset({ kind: 'bank' })), { ok: true, target: 'bank' });
  assert.equal(b.loadBank()[0]!.positioner.stillId, null);
  assert.equal(b.loadBank()[0]!.positioner.sceneGrabber, true); // only the blob ref is stripped
});

test('a malformed fieldPreset payload is rejected as corrupt, and boot survives a bad snapshot', () => {
  const b = createPersistence(new MemoryStorageBackend());
  const bad = JSON.stringify({ schemaVersion: 1, target: 'fieldPreset', data: 42 });
  assert.deepEqual(b.importPreset(bad), { ok: false, reason: 'corrupt' });
  assert.equal(b.readFieldPreset(), null);
  // Defence in depth: even a directly-persisted garbage snapshot must not brick boot.
  const backend = new MemoryStorageBackend();
  const c = createPersistence(backend);
  c.saveSettings({ reset: 'off' });
  backend.set('mx50:fieldPreset', JSON.stringify({ schemaVersion: 1, data: { busA: {}, transition: {}, positioner: {} } }));
  const booted = c.restoreOnBoot(); // malformed but envelope-valid → factory fallback, no throw
  assert.equal(booted.programOut, FACTORY_PRESET.programOut);
});

test('a non-array bank payload is rejected as corrupt', () => {
  const b = createPersistence(new MemoryStorageBackend());
  const bad = JSON.stringify({ schemaVersion: 1, target: 'bank', data: { not: 'an array' } });
  assert.deepEqual(b.importPreset(bad), { ok: false, reason: 'corrupt' });
});
