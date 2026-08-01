// Step definitions for event-memory.feature (reference §13) and the auto-take.feature "Memory
// Auto Take" Rule. Event Memory is a pure store operation: STORE writes panelSnapshot(state)
// into the in-store bank; RECALL (via an armed EVENT NO. + AUTO TAKE) rehydrates the panel and
// advances the sequence cursor, preserving the bank. Persistence round-trips through a fake
// MemoryStorageBackend on the World (ADR-0015). "I press AUTO TAKE"(" again") reuse auto-take.steps.

import { Given, When, Then } from '@cucumber/cucumber';
import assert from 'node:assert/strict';
import type { MixerWorld } from '../support/world.js';
import type { SourceSlot } from '../../../src/core/types.js';
import { panelSnapshot, EVENT_LED_STORE_BLINKS } from '../../../src/state/state.js';
import { occupiedSlots, stillKeyForSlot } from '../../../src/core/event-memory.js';

const nums = (s: string): number[] => (s.match(/\d+/g) ?? []).map(Number);
const slotSnap = (w: MixerWorld, slot: number) => w.snapshot().memory.slots[slot - 1];

// --- Background ---

Given('the eight Event Memory slots numbered 1 through 8 are available', function (this: MixerWorld) {
  this.memBaseline = panelSnapshot(this.snapshot());
});
Given("a persistence module owns all browser-storage access on the app's behalf", function () {});

// --- panel setup ---

Given('the panel is set up with Source 1 on the A-bus, Source 2 on the B-bus, a wipe transition and colour correction', function (this: MixerWorld) {
  this.dispatch({ type: 'ASSIGN_SOURCE', bus: 'A', source: 1 as SourceSlot });
  this.dispatch({ type: 'ASSIGN_SOURCE', bus: 'B', source: 2 as SourceSlot });
  this.dispatch({ type: 'SET_TRANSITION_TYPE', transition: 'wipe' });
  this.dispatch({ type: 'PRESS_COLOUR_CORRECT', bus: 'A' });
});
Given('the panel is set up as desired', function () {});
Given('the panel is set up with a different look', function (this: MixerWorld) {
  this.dispatch({ type: 'SET_MATTE_COLOR', colorIndex: 7 });
});

// --- slot preconditions ---

Given(/^(?:Event Memory )?slot (\d+) (?:already )?holds a stored panel snapshot$/, function (this: MixerWorld, n: string) {
  this.storeDistinctiveSnapshot(Number(n));
});
Given(/^(?:only )?(?:Event Memory )?slots (.+?) (?:each )?holds? (?:a )?stored (?:panel )?snapshots?$/, function (this: MixerWorld, list: string) {
  for (const n of nums(list)) this.storeDistinctiveSnapshot(n);
});
Given('several Event Memory slots hold stored panel snapshots', function (this: MixerWorld) {
  for (const n of [1, 3, 6]) this.storeDistinctiveSnapshot(n);
});
Given(/^slots? (.+?) (?:is|are) empty$/, function (this: MixerWorld, list: string) {
  for (const n of nums(list)) assert.equal(slotSnap(this, n), null);
});
Given('sequential playback is armed at the start of the bank', function (this: MixerWorld) {
  const first = occupiedSlots(this.snapshot().memory.slots)[0]!;
  this.pressEventNo(((first - 1) % 4) + 1, first > 4);
});
Given(/^slot (\d+) has just been recalled by sequential playback$/, function (this: MixerWorld, n: string) {
  const slot = Number(n);
  this.pressEventNo(((slot - 1) % 4) + 1, slot > 4);
  this.pressAutoTake();
});
Given(/^event (\d+) is the armed event$/, function (this: MixerWorld, n: string) {
  const slot = Number(n);
  this.pressEventNo(((slot - 1) % 4) + 1, slot > 4);
});

// --- store presses ---

When('I press MEMORY', function (this: MixerWorld) {
  this.pressMemory();
});
When(/^I press EVENT NO\. (\d+)$/, function (this: MixerWorld, n: string) {
  this.pressEventNo(Number(n), false);
});
When(/^I hold SHIFT and press EVENT NO\. (\d+)$/, function (this: MixerWorld, n: string) {
  this.pressEventNo(Number(n), true);
});
When(/^I recall Event Memory slot (\d+)$/, function (this: MixerWorld, n: string) {
  this.pressEventNo(Number(n), false);
});

// --- store assertions ---

Then(/^the (?:current )?panel snapshot is written to slot (\d+)$/, function (this: MixerWorld, n: string) {
  assert.deepEqual(slotSnap(this, Number(n)), panelSnapshot(this.snapshot()));
});
Then('the snapshot includes the source and bus assignment, colour correction, digital-effect selection, wipe and mix setup, key and DSK setup, matte colour, fade enables and audio levels', function (this: MixerWorld) {
  const slot = slotSnap(this, this.snapshot().memory.lastStoredSlot!)!;
  for (const key of ['busA', 'busB', 'colourCorrect', 'digitalEffect', 'transition', 'dsk', 'matte', 'fade', 'audio'] as const) {
    const present = key === 'colourCorrect' ? slot.busA.colourCorrect !== undefined : (slot as Record<string, unknown>)[key] !== undefined;
    assert.ok(present, `snapshot includes ${key}`);
  }
});
Then('the snapshot excludes volatile runtime state such as GPU frame memory, transition progress and timers', function (this: MixerWorld) {
  const slot = slotSnap(this, this.snapshot().memory.lastStoredSlot!)! as Record<string, unknown>;
  assert.equal('memory' in slot, false);
  assert.equal('specialMode' in slot, false);
  assert.equal((slot.transition as { auto: { phase: string } }).auto.phase, 'idle');
});
Then(/^the event LED for slot (\d+) blinks exactly 3 times to confirm the store$/, function (this: MixerWorld, n: string) {
  assert.equal(this.snapshot().memory.lastStoredSlot, Number(n));
  assert.equal(EVENT_LED_STORE_BLINKS, 3);
});
Then(/^slot (\d+) holds the new panel snapshot$/, function (this: MixerWorld, n: string) {
  assert.deepEqual(slotSnap(this, Number(n)), panelSnapshot(this.snapshot()));
});
Then(/^the previous contents of slot (\d+) are discarded$/, function (this: MixerWorld, n: string) {
  assert.equal(slotSnap(this, Number(n))!.matte.colorIndex, this.snapshot().matte.colorIndex);
});

// --- recall assertions ---

Then(/^slot (\d+) is armed for recall$/, function (this: MixerWorld, n: string) {
  assert.equal(this.snapshot().memory.armedSlot, Number(n));
});
Then('the panel state is unchanged until I press AUTO TAKE', function (this: MixerWorld) {
  assert.deepEqual(panelSnapshot(this.snapshot()), this.memBaseline);
});
Then('the panel state is unchanged', function (this: MixerWorld) {
  assert.deepEqual(panelSnapshot(this.snapshot()), this.memBaseline);
});
Then(/^the panel state is restored from the slot (\d+) snapshot$/, function (this: MixerWorld, n: string) {
  assert.deepEqual(panelSnapshot(this.snapshot()), slotSnap(this, Number(n)));
});
Then('the restore dispatches through the normal store update path so the UI and render loop react as to a manual change', function (this: MixerWorld) {
  assert.ok(this.notifyCount > this.armNotifyMark, 'recall notified store subscribers');
});
Then(/^the transition stored in event (\d+) is performed automatically$/, function (this: MixerWorld, n: string) {
  assert.deepEqual(this.snapshot().transition, slotSnap(this, Number(n))!.transition);
});
Then(/^event (\d+) is armed as the next event$/, function (this: MixerWorld, n: string) {
  assert.equal(this.snapshot().memory.armedSlot, Number(n));
});
Then(/^event (\d+) is armed next, skipping the empty slots .+$/, function (this: MixerWorld, n: string) {
  assert.equal(this.snapshot().memory.armedSlot, Number(n));
});

// --- sequential playback ---

When('I press AUTO TAKE three times in succession', function (this: MixerWorld) {
  for (let i = 0; i < 3; i++) this.pressAutoTakeCapturing();
});
When('I press AUTO TAKE three times, each after the prior take completes', function (this: MixerWorld) {
  for (let i = 0; i < 3; i++) this.pressAutoTakeCapturing();
});
When(/^I press AUTO TAKE to perform event \d+$/, function (this: MixerWorld) {
  this.pressAutoTakeCapturing();
});
Then(/^slot (\d+) is recalled, then slot (\d+), then slot (\d+) in that order$/, function (this: MixerWorld, a: string, b: string, c: string) {
  assert.deepEqual(this.recalledOrder, [Number(a), Number(b), Number(c)]);
});
Then(/^event (\d+) is performed, then event (\d+), then event (\d+)$/, function (this: MixerWorld, a: string, b: string, c: string) {
  assert.deepEqual(this.recalledOrder, [Number(a), Number(b), Number(c)]);
});
Then('each press arms the following event automatically', function (this: MixerWorld) {
  assert.deepEqual(this.armedAfter, [2, 3, 4]);
});
Then('no empty slot is recalled', function (this: MixerWorld) {
  const occ = occupiedSlots(this.snapshot().memory.slots);
  for (const s of this.recalledOrder) assert.ok(occ.indexOf(s) !== -1, `slot ${s} is occupied`);
});
Then('no further stored memory remains in the sequence for this pass', function (this: MixerWorld) {
  const occ = occupiedSlots(this.snapshot().memory.slots);
  const armed = this.snapshot().memory.armedSlot;
  assert.ok(occ.every((s) => armed === null || s < armed), 'no occupied slot at/after the cursor');
});

// --- clear / power cycle / persistence ---

When('I power the mixer off', function () {});
When('I hold MEMORY and SHIFT while powering the mixer on', function (this: MixerWorld) {
  this.clearAllOnPowerUp();
});
When('I power the mixer off and on without holding MEMORY and SHIFT', function (this: MixerWorld) {
  this.reload();
});
When('the application is reloaded', function (this: MixerWorld) {
  this.reload();
});
Then('all eight Event Memory slots are cleared', function (this: MixerWorld) {
  for (const slot of this.snapshot().memory.slots) assert.equal(slot, null);
});
Then('every slot reports as empty', function (this: MixerWorld) {
  assert.equal(occupiedSlots(this.snapshot().memory.slots).length, 0);
});
Then(/^slots (.+?) still hold their stored panel snapshots$/, function (this: MixerWorld, list: string) {
  for (const n of nums(list)) assert.notEqual(slotSnap(this, n), null);
});
Then(/^slot (\d+) still holds its stored panel snapshot$/, function (this: MixerWorld, n: string) {
  assert.notEqual(slotSnap(this, Number(n)), null);
});
Then('the snapshot is read back synchronously from local storage at boot', function (this: MixerWorld) {
  assert.equal(this.lastReloadSync, true);
  assert.notEqual(this.storage.get('mx50:eventMemory'), null);
});

// ===========================================================================
// Two-tier still persistence (@integration, ADR-0015): the blob tier commits
// FIRST, the snapshot carries only a still-reference id, and recall re-uploads
// the pixels through the GpuStillPort. Headless via MemoryBlobBackend + the
// World's FakeGpuStillPort; async steps settle on stills.idle().
// ===========================================================================

Given('the panel setup includes a Scene Grabber still the user chose to store', function (this: MixerWorld) {
  this.attachStills();
  this.dispatch({ type: 'SET_TRANSITION_TYPE', transition: 'wipe' });
  this.dispatch({ type: 'PRESS_WIPE_FAMILY', family: 'square' });
  this.dispatch({ type: 'PRESS_COMPRESSION' });
  this.dispatch({ type: 'PRESS_POSITIONER' });
  this.dispatch({ type: 'PRESS_SCENE_GRABBER' }); // a genuine grabbed PiP
});
Then('the still pixels are written to IndexedDB under the slot 5 key first', async function (this: MixerWorld) {
  await this.stills.idle();
  assert.notEqual(await this.blobs.get(stillKeyForSlot(5)), null);
  const blobIdx = this.tierJournal.indexOf('blob:set:' + stillKeyForSlot(5));
  const bankIdx = this.tierJournal.indexOf('bank:set');
  assert.ok(blobIdx !== -1 && bankIdx !== -1 && blobIdx < bankIdx, 'blob tier committed before localStorage');
});
Then('then the panel snapshot carrying only a still-reference id is committed to local storage', async function (this: MixerWorld) {
  await this.stills.idle();
  const slot5 = this.persistence.loadBank()[4]!;
  assert.equal(slot5.positioner.stillId, stillKeyForSlot(5));
  assert.ok(JSON.stringify(slot5).length < 8192, 'a reference id, not a pixel payload');
});
Then('slot 5 references its still consistently across both backends', async function (this: MixerWorld) {
  await this.stills.idle();
  const id = this.snapshot().memory.slots[4]!.positioner.stillId!;
  assert.ok((await this.blobs.keys()).indexOf(id) !== -1);
  assert.equal(this.persistence.loadBank()[4]!.positioner.stillId, id);
});

Given('slot 5 holds a snapshot that references a captured still in IndexedDB', async function (this: MixerWorld) {
  this.attachStills();
  this.dispatch({ type: 'SET_TRANSITION_TYPE', transition: 'wipe' });
  this.dispatch({ type: 'PRESS_WIPE_FAMILY', family: 'square' });
  this.dispatch({ type: 'PRESS_COMPRESSION' });
  this.dispatch({ type: 'PRESS_POSITIONER' });
  this.dispatch({ type: 'PRESS_SCENE_GRABBER' });
  this.pressMemory();
  this.pressEventNo(1, true); // store into slot 5
  await this.stills.idle();
  this.dispatch({ type: 'PRESS_SCENE_GRABBER' }); // release, so the recall demonstrably restores it
  this.fakeGpu.injected = null;
});
Then('the referenced still blob is loaded from IndexedDB and re-uploaded to a GPU texture', async function (this: MixerWorld) {
  await this.stills.idle();
  assert.ok(this.tierJournal.indexOf('blob:get:' + stillKeyForSlot(5)) !== -1, 'served from the blob tier');
  assert.notEqual(this.fakeGpu.injected, null, 'pixels re-uploaded through the GPU port');
  assert.deepEqual(this.fakeGpu.injected!.grab, this.fakeGpu.currentGrab(), 'grab geometry rode with the blob');
  assert.equal(this.fakeGpu.injected!.pixels.byteLength, this.fakeGpu.injected!.width * this.fakeGpu.injected!.height * 4);
});
