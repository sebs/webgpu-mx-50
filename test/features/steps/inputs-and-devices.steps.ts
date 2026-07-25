// Step definitions for the Phase 0 subset of inputs-and-devices.feature (Rule: "Each
// of the four sources can be bound to any single media provider"). These drive the
// headless SourceBindingRegistry — no browser device access — proving the binding
// domain rules. Later phases add the remaining rules (External Camera, aux audio,
// permissions).

import { Given, When, Then } from '@cucumber/cucumber';
import assert from 'node:assert/strict';
import type { MixerWorld } from '../support/world.js';
import type { SourceSlot } from '../../../src/core/types.js';
import type { SourceKind } from '../../../src/sources/source.js';

function kindOf(phrase: string): SourceKind {
  switch (phrase.trim()) {
    case 'camera device':
      return 'camera';
    case 'video file':
      return 'video';
    case 'image':
      return 'image';
    case 'generated source':
      return 'generated';
    default:
      throw new Error(`Unknown media target kind: "${phrase}"`);
  }
}

const slot = (n: string): SourceSlot => Number(n) as SourceSlot;
const providerFor = (kind: SourceKind): string => `${kind}-provider-1`;

function bind(world: MixerWorld, n: string, phrase: string, providerId: string): void {
  const kind = kindOf(phrase);
  world.lastProvider = providerId;
  world.lastProviderByKind.set(kind, providerId);
  world.bindings.bind(slot(n), kind, providerId);
}

// --- Background -------------------------------------------------------------

Given('the mixer exposes four source inputs numbered {int} to {int}', function (
  this: MixerWorld,
  from: number,
  to: number,
) {
  assert.equal(from, 1);
  assert.equal(to, 4);
  assert.equal(this.bindings.slots.length, 4);
});

Given('each source input holds exactly one active binding', function () {
  // Structural invariant of SourceBindingRegistry (one Binding per slot).
});

Given(
  'a binding target is one of a camera device, a video file, an image, or a generated source',
  function () {
    // Documentary step: the accepted target kinds. Enforced by kindOf().
  },
);

Given('the browser has enumerated the available media input devices', function (this: MixerWorld) {
  this.enumeratedDevices = ['camera-provider-1', 'camera-provider-2', 'mic-provider-1'];
});

// --- Binding ---------------------------------------------------------------

When(/^I bind Source (\d+) to an? (.+)$/, function (this: MixerWorld, n: string, phrase: string) {
  bind(this, n, phrase, providerFor(kindOf(phrase)));
});

Given(/^Source (\d+) is bound to an? (.+)$/, function (this: MixerWorld, n: string, phrase: string) {
  bind(this, n, phrase, providerFor(kindOf(phrase)));
});

When(/^I bind Source (\d+) to the same (.+)$/, function (this: MixerWorld, n: string, phrase: string) {
  const kind = kindOf(phrase);
  const providerId = this.lastProviderByKind.get(kind) ?? providerFor(kind);
  bind(this, n, phrase, providerId);
});

// --- Assertions ------------------------------------------------------------

function assertKind(world: MixerWorld, n: string, phrase: string): void {
  const b = world.bindings.get(slot(n));
  assert.ok(b, `Source ${n} has no binding`);
  assert.equal(b.kind, kindOf(phrase));
}

Then(/^Source (\d+) supplies video from that (.+)$/, function (this: MixerWorld, n: string, phrase: string) {
  assertKind(this, n, phrase);
});

Then(/^Source (\d+) supplies video from the (.+)$/, function (this: MixerWorld, n: string, phrase: string) {
  assertKind(this, n, phrase);
});

Then(/^Source (\d+) exposes one active binding only$/, function (this: MixerWorld, n: string) {
  assert.ok(this.bindings.get(slot(n)), `Source ${n} has no binding`);
});

Then('the bound provider is available for selection on either bus', function (this: MixerWorld) {
  assert.ok(
    this.bindings.availableProviders().includes(this.lastProvider),
    `provider ${this.lastProvider} is not offered for selection`,
  );
});

Then(/^the previously bound (.+) no longer feeds Source (\d+)$/, function (
  this: MixerWorld,
  phrase: string,
  n: string,
) {
  const b = this.bindings.get(slot(n));
  assert.ok(b, `Source ${n} has no binding`);
  assert.notEqual(b.kind, kindOf(phrase));
});

Then(/^Source (\d+) supplies a single unchanging frame from that (.+)$/, function (
  this: MixerWorld,
  n: string,
  phrase: string,
) {
  const b = this.bindings.get(slot(n));
  assert.ok(b, `Source ${n} has no binding`);
  assert.equal(b.kind, kindOf(phrase));
  assert.equal(b.still, true);
});

Then(/^Source (\d+) carries no audio$/, function (this: MixerWorld, n: string) {
  const b = this.bindings.get(slot(n));
  assert.ok(b, `Source ${n} has no binding`);
  assert.equal(b.hasAudio, false);
});

Then(/^both Source (\d+) and Source (\d+) supply video from that (.+)$/, function (
  this: MixerWorld,
  a: string,
  b: string,
  phrase: string,
) {
  const kind = kindOf(phrase);
  const ba = this.bindings.get(slot(a));
  const bb = this.bindings.get(slot(b));
  assert.ok(ba && bb, 'both sources must be bound');
  assert.equal(ba.kind, kind);
  assert.equal(bb.kind, kind);
  assert.equal(ba.providerId, bb.providerId);
});
