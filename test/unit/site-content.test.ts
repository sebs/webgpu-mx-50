// The docs site's authored interactive content, run headlessly: the bench looks, the
// "Learn the panel" tour, the recipe playback scripts, and the share-link codec. Each is a
// list of real store commands, so each is checked against the real reducer here — a
// recipe whose playback no longer reaches the state its scenario asserts fails the gate
// before it can ship as a demo that silently shows the wrong thing.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createEngine } from '../../src/app.js';
import { createPersistence } from '../../src/persistence/persistence.js';
import { MemoryStorageBackend } from '../../src/persistence/backend.js';
import { BLOCK_REFERENCE } from '../../src/ui/blocks/reference.js';
import { LOOKS, look } from '../../site/looks.js';
import { TOUR, blocksAt } from '../../site/tour.js';
import { RECIPE_SCRIPTS, DEFERRED_RECIPES } from '../../site/recipes.js';
import { encodeLook, decodeLook, lookUrl, lookFor } from '../../site/look-link.js';
import type { Command } from '../../src/state/commands.js';

function run(commands: readonly Command[]) {
  const engine = createEngine();
  for (const command of commands) engine.store.dispatch(command);
  return engine.store.getSnapshot();
}

test('every look exports a field preset that the mixer import path accepts', () => {
  assert.equal(new Set(LOOKS.map((l) => l.id)).size, LOOKS.length, 'look ids are unique');
  for (const l of LOOKS) {
    const staging = createPersistence(new MemoryStorageBackend());
    staging.captureFieldPreset(run(l.commands));
    const result = createPersistence(new MemoryStorageBackend()).importPreset(staging.exportPreset({ kind: 'fieldPreset' }));
    assert.equal(result.ok, true, l.id);
  }
  assert.throws(() => look('no-such-look'));
});

test('looks reach the state their titles promise', () => {
  assert.equal(run(look('dsk-title').commands).dsk.on, true);
  assert.equal(run(look('cc-tint').commands).busA.colourCorrect.mode, 'chroma-plus-joystick');
  assert.equal(run(look('effect-mosaic').commands).digitalEffect.active.mosaic, true);
  const pip = run(look('positioner-pip').commands);
  assert.ok(pip.positioner.on && pip.transition.wipe.family === 'square');
  const fade = run(look('fade-video-only').commands);
  assert.ok(fade.fade.video && !fade.fade.dsk && fade.fade.lever > 0);
});

test('every tour step reduces from the factory panel and names known blocks', () => {
  assert.ok(TOUR.length >= 5);
  for (let i = 0; i < TOUR.length; i++) {
    run(TOUR[i]!.setup); // must not throw
    for (const tag of blocksAt(i)) assert.ok(BLOCK_REFERENCE[tag], `${TOUR[i]!.id}: unknown block ${tag}`);
  }
  assert.deepEqual(blocksAt(0), ['mx-source-block']);
  assert.ok(blocksAt(TOUR.length - 1).length > blocksAt(0).length, 'blocks accumulate');
  assert.equal(run(TOUR[TOUR.length - 1]!.setup).dsk.on, true);
});

test('each recipe playback reaches every state its scenario asserts', () => {
  for (const script of RECIPE_SCRIPTS) {
    const engine = createEngine();
    for (const step of script.steps) {
      for (const command of step.commands) engine.store.dispatch(command);
      if (step.check) assert.equal(step.check(engine.store.getSnapshot()), true, `recipe ${script.recipe}: "${step.step}"`);
    }
    for (const tag of script.blocks) assert.ok(BLOCK_REFERENCE[tag], `recipe ${script.recipe}: unknown block ${tag}`);
  }
});

test('a recipe is either played or deferred, never both', () => {
  const played = RECIPE_SCRIPTS.map((r) => r.recipe);
  for (const d of DEFERRED_RECIPES) assert.equal(played.indexOf(d.recipe), -1);
});

test('look links round-trip a preset, including non-ASCII text', () => {
  const json = '{"schemaVersion":1,"target":"fieldPreset","data":{"name":"Überblendung — ß"}}';
  const value = encodeLook('dsk', json);
  assert.match(value, /^dsk\.[A-Za-z0-9_-]+$/);
  assert.deepEqual(decodeLook(value), { benchId: 'dsk', json });
  const url = lookUrl('https://example.org/site/machine/?x=1#top', 'dsk', json);
  assert.equal(new URL(url).hash, '#dsk');
  assert.equal(new URL(url).searchParams.get('x'), '1');
  assert.equal(lookFor(url, 'dsk'), json);
  assert.equal(lookFor(url, 'fade'), null, 'a link for one bench restores nothing on another');
});

test('malformed look links decode to null', () => {
  assert.equal(decodeLook('nodot'), null);
  assert.equal(decodeLook('.abc'), null);
  assert.equal(decodeLook('dsk.***'), null);
  assert.equal(decodeLook('dsk.' + btoa(String.fromCharCode(0xff, 0xfe))), null, 'invalid UTF-8');
  assert.equal(lookFor('https://example.org/', 'dsk'), null);
});
