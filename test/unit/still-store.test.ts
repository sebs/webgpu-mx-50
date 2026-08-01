import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reduce } from '../../src/state/reducer.js';
import { FACTORY_PRESET } from '../../src/state/state.js';
import type { PanelState } from '../../src/state/state.js';
import { MemoryBlobBackend, MemoryStorageBackend } from '../../src/persistence/backend.js';
import { createPersistence } from '../../src/persistence/persistence.js';
import { bankTouchesStills, createStillStore } from '../../src/persistence/still-store.js';
import type { GpuStillPort } from '../../src/persistence/still-store.js';
import { stillKeyForSlot } from '../../src/core/event-memory.js';
import { alignedBytesPerRow, packTightRows } from '../../src/gpu/readback.js';
import type { GrabCapture, StillPixels, StillRecord } from '../../src/core/positioner.js';

/** Blob backend that journals every tier operation into a shared log. */
class JournaledBlobBackend extends MemoryBlobBackend {
  constructor(private readonly journal: string[]) {
    super();
  }
  override set(key: string, record: StillRecord): Promise<void> {
    this.journal.push(`blob:set:${key}`);
    return super.set(key, record);
  }
  override get(key: string): Promise<StillRecord | null> {
    this.journal.push(`blob:get:${key}`);
    return super.get(key);
  }
  override remove(key: string): Promise<void> {
    this.journal.push(`blob:remove:${key}`);
    return super.remove(key);
  }
}

/** Storage backend journaling bank writes. */
class JournaledStorageBackend extends MemoryStorageBackend {
  constructor(private readonly journal: string[]) {
    super();
  }
  override set(key: string, value: string): void {
    if (key === 'mx50:eventMemory') this.journal.push('bank:set');
    super.set(key, value);
  }
}

class FakeGpuStillPort implements GpuStillPort {
  grab: GrabCapture = { cu: 0.5, cv: 0.5, half: 0.2, compressed: true };
  injected: StillRecord | null = null;
  readStill(): Promise<StillPixels> {
    return Promise.resolve({ width: 4, height: 2, pixels: new ArrayBuffer(32) });
  }
  currentGrab(): GrabCapture {
    return { ...this.grab };
  }
  injectStill(record: StillRecord): void {
    this.injected = record;
  }
}

function harness() {
  const journal: string[] = [];
  const blobs = new JournaledBlobBackend(journal);
  const persistence = createPersistence(new JournaledStorageBackend(journal));
  const port = new FakeGpuStillPort();
  const stills = createStillStore(blobs, persistence, port);
  return { journal, blobs, persistence, port, stills };
}

/** The canonical grabbed-PiP-store flow: returns [prev, next] states around the store. */
function storedStillStates(slot5 = true): [PanelState, PanelState] {
  let s = structuredClone(FACTORY_PRESET);
  s = reduce(s, { type: 'SET_TRANSITION_TYPE', transition: 'wipe' });
  s = reduce(s, { type: 'PRESS_WIPE_FAMILY', family: 'square' });
  s = reduce(s, { type: 'PRESS_COMPRESSION' });
  s = reduce(s, { type: 'PRESS_POSITIONER' });
  s = reduce(s, { type: 'PRESS_SCENE_GRABBER' });
  s = reduce(s, { type: 'PRESS_MEMORY' });
  const prev = s;
  const next = reduce(s, { type: 'PRESS_EVENT_NO', button: slot5 ? 1 : 2, shift: slot5 });
  return [prev, next];
}

test('a store carrying a live Scene-Grabber still commits the blob before the snapshot', async () => {
  const { journal, blobs, stills, port } = harness();
  const [prev, next] = storedStillStates();
  await stills.commitBank(next, prev);
  const b = journal.indexOf('blob:set:' + stillKeyForSlot(5));
  const s = journal.indexOf('bank:set');
  assert.ok(b !== -1 && s !== -1 && b < s, `blob first: ${journal.join(',')}`);
  const record = await blobs.get(stillKeyForSlot(5));
  assert.ok(record);
  assert.equal(record.pixels.byteLength, record.width * record.height * 4);
  assert.deepEqual(record.grab, port.currentGrab());
});

test('a still-less store never touches the blob tier', async () => {
  const { journal, stills } = harness();
  let s = structuredClone(FACTORY_PRESET);
  s = reduce(s, { type: 'PRESS_MEMORY' });
  const next = reduce(s, { type: 'PRESS_EVENT_NO', button: 1, shift: false });
  await stills.commitBank(next, s);
  assert.equal(journal.filter((e) => e.indexOf('blob:') === 0).length, 0);
  assert.ok(journal.indexOf('bank:set') !== -1);
});

test('overwriting a still slot with a plain snapshot removes the blob only after the bank commit', async () => {
  const { journal, blobs, stills } = harness();
  const [prev, withStill] = storedStillStates();
  await stills.commitBank(withStill, prev);
  // A plain store into slot 5 (no grab on screen).
  let plain = reduce(withStill, { type: 'PRESS_SCENE_GRABBER' }); // release the grab
  plain = reduce(plain, { type: 'PRESS_MEMORY' });
  const overwritten = reduce(plain, { type: 'PRESS_EVENT_NO', button: 1, shift: true });
  await stills.commitBank(overwritten, plain);
  const lastBank = journal.lastIndexOf('bank:set');
  const removal = journal.indexOf('blob:remove:' + stillKeyForSlot(5));
  assert.ok(removal > lastBank - 2 && removal > 0);
  assert.equal(await blobs.get(stillKeyForSlot(5)), null);
});

test('recallStill injects pixels and grab; a missing blob returns false', async () => {
  const { blobs, stills, port } = harness();
  const record: StillRecord = {
    width: 4,
    height: 2,
    pixels: new ArrayBuffer(32),
    grab: { cu: 0.7, cv: 0.3, half: 0.15, compressed: false },
  };
  await blobs.set(stillKeyForSlot(5), record);
  assert.equal(await stills.recallStill(stillKeyForSlot(5)), true);
  assert.deepEqual(port.injected, record);
  port.injected = null;
  assert.equal(await stills.recallStill(stillKeyForSlot(7)), false);
  assert.equal(port.injected, null);
  assert.equal(await stills.recallStill(null), false);
  assert.equal(await stills.recallStill(undefined), false);
});

test('a rejecting blob set still persists the snapshot (degraded, never throws)', async () => {
  const journal: string[] = [];
  const failing = new (class extends JournaledBlobBackend {
    override set(): Promise<void> {
      return Promise.reject(new Error('quota'));
    }
  })(journal);
  const persistence = createPersistence(new JournaledStorageBackend(journal));
  const stills = createStillStore(failing, persistence, new FakeGpuStillPort());
  const [prev, next] = storedStillStates();
  await stills.commitBank(next, prev); // must not throw
  assert.ok(journal.indexOf('bank:set') !== -1);
  assert.equal(await stills.recallStill(stillKeyForSlot(5)), false);
});

test('sweepOrphans removes unreferenced keys and keeps referenced ones; clearAll empties', async () => {
  const { blobs, stills } = harness();
  const rec: StillRecord = { width: 1, height: 1, pixels: new ArrayBuffer(4), grab: { cu: 0.5, cv: 0.5, half: 0.1, compressed: false } };
  await blobs.set(stillKeyForSlot(2), rec);
  await blobs.set(stillKeyForSlot(6), rec);
  const [, withStill] = storedStillStates(); // slot 5 referenced in its bank
  const slots = withStill.memory.slots.slice();
  // Reference only slot 2 from the bank we sweep against.
  const referencing = structuredClone(slots);
  referencing[1] = { ...withStill.memory.slots[4]!, positioner: { ...withStill.memory.slots[4]!.positioner, stillId: stillKeyForSlot(2) } };
  referencing[4] = null;
  await stills.sweepOrphans(referencing);
  assert.notEqual(await blobs.get(stillKeyForSlot(2)), null);
  assert.equal(await blobs.get(stillKeyForSlot(6)), null);
  await stills.clearAll();
  assert.equal(await blobs.get(stillKeyForSlot(2)), null);
});

test('tier operations serialize in dispatch order and idle() settles after all', async () => {
  const { journal, stills, blobs } = harness();
  const rec: StillRecord = { width: 1, height: 1, pixels: new ArrayBuffer(4), grab: { cu: 0, cv: 0, half: 0.1, compressed: false } };
  await blobs.set(stillKeyForSlot(3), rec);
  journal.length = 0;
  const [prev, next] = storedStillStates();
  void stills.commitBank(next, prev);
  void stills.recallStill(stillKeyForSlot(3));
  await stills.idle();
  const setIdx = journal.indexOf('blob:set:' + stillKeyForSlot(5));
  const getIdx = journal.indexOf('blob:get:' + stillKeyForSlot(3));
  assert.ok(setIdx !== -1 && getIdx !== -1 && setIdx < getIdx, journal.join(','));
});

// --- readback helpers --------------------------------------------------------

test('alignedBytesPerRow rounds width*4 up to 256', () => {
  assert.equal(alignedBytesPerRow(3), 256);
  assert.equal(alignedBytesPerRow(64), 256);
  assert.equal(alignedBytesPerRow(100), 512);
  assert.equal(alignedBytesPerRow(128), 512);
});

test('packTightRows strips row padding', () => {
  const width = 3;
  const height = 2;
  const bytesPerRow = alignedBytesPerRow(width); // 256
  const padded = new Uint8Array(bytesPerRow * height).fill(0xee); // sentinel padding
  for (let y = 0; y < height; y++) {
    for (let i = 0; i < width * 4; i++) padded[y * bytesPerRow + i] = y * 100 + i;
  }
  const tight = new Uint8Array(packTightRows(padded, bytesPerRow, width, height));
  assert.equal(tight.length, width * 4 * height);
  for (let y = 0; y < height; y++) {
    for (let i = 0; i < width * 4; i++) assert.equal(tight[y * width * 4 + i], y * 100 + i);
  }
  assert.equal(tight.indexOf(0xee), -1);
});

// --- MemoryBlobBackend -------------------------------------------------------

test('MemoryBlobBackend round-trips asynchronously and isolates per instance', async () => {
  const a = new MemoryBlobBackend();
  const b = new MemoryBlobBackend();
  const rec: StillRecord = { width: 2, height: 2, pixels: new ArrayBuffer(16), grab: { cu: 0, cv: 0, half: 0.1, compressed: true } };
  await a.set('k', rec);
  assert.deepEqual(await a.get('k'), rec);
  assert.equal(await b.get('k'), null);
  assert.deepEqual(await a.keys(), ['k']);
  await a.remove('k');
  assert.equal(await a.get('k'), null);
});

// --- review-fix regressions ---------------------------------------------------

test('a LOAD_BANK import while a grab is live NEVER overwrites stored blobs (mint guard)', async () => {
  const { journal, blobs, stills } = harness();
  // A stored still exists in the blob tier for slot 5.
  const original: StillRecord = {
    width: 4, height: 2, pixels: new ArrayBuffer(32),
    grab: { cu: 0.1, cv: 0.9, half: 0.25, compressed: true },
  };
  await blobs.set(stillKeyForSlot(5), original);
  // The imported bank carries a slot-keyed stillId... (an exported bank round-trip)
  const [, withStill] = storedStillStates();
  const importedSlots = withStill.memory.slots;
  // ...and the operator has an UNSAVED grab on screen (sceneGrabber true, live stillId null).
  let live = structuredClone(FACTORY_PRESET);
  live = reduce(live, { type: 'SET_TRANSITION_TYPE', transition: 'wipe' });
  live = reduce(live, { type: 'PRESS_WIPE_FAMILY', family: 'square' });
  live = reduce(live, { type: 'PRESS_POSITIONER' });
  live = reduce(live, { type: 'PRESS_SCENE_GRABBER' });
  assert.equal(live.positioner.stillId, null);
  const next = reduce(live, { type: 'LOAD_BANK', slots: importedSlots });
  journal.length = 0;
  await stills.commitBank(next, live);
  assert.equal(journal.filter((e) => e.indexOf('blob:set:') === 0).length, 0, 'no blob writes on import');
  assert.deepEqual(await blobs.get(stillKeyForSlot(5)), original, 'the stored blob survives');
});

test('sweepOrphans keeps blobs referenced by an extra root (the restored live panel)', async () => {
  const { blobs, stills } = harness();
  const rec: StillRecord = { width: 1, height: 1, pixels: new ArrayBuffer(4), grab: { cu: 0, cv: 0, half: 0.1, compressed: false } };
  await blobs.set(stillKeyForSlot(5), rec);
  await stills.sweepOrphans([null, null, null, null, null, null, null, null], [stillKeyForSlot(5)]);
  assert.notEqual(await blobs.get(stillKeyForSlot(5)), null);
  await stills.sweepOrphans([null, null, null, null, null, null, null, null], [null]);
  assert.equal(await blobs.get(stillKeyForSlot(5)), null);
});

test('bankTouchesStills routes still-less changes to the synchronous path', () => {
  let plain = structuredClone(FACTORY_PRESET);
  plain = reduce(plain, { type: 'PRESS_MEMORY' });
  const plainStored = reduce(plain, { type: 'PRESS_EVENT_NO', button: 1, shift: false });
  assert.equal(bankTouchesStills(plainStored, plain), false);
  const [prev, withStill] = storedStillStates();
  assert.equal(bankTouchesStills(withStill, prev), true);
  // Overwriting a still-carrying slot with a plain snapshot still touches the tier (removal).
  let release = reduce(withStill, { type: 'PRESS_SCENE_GRABBER' });
  release = reduce(release, { type: 'PRESS_MEMORY' });
  const overwritten = reduce(release, { type: 'PRESS_EVENT_NO', button: 1, shift: true });
  assert.equal(bankTouchesStills(overwritten, release), true);
});
