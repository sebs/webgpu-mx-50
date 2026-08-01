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
import type { AudioChannel, AudioProviderKind } from '../../../src/sources/audio-binding.js';
import { dskKeyFeed } from '../../../src/core/dsk.js';
import { micAux2Active, micAux2Muted, programAudioMix } from '../../../src/core/audio.js';

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
  if (phrase.trim() === 'chosen camera') {
    // Rule 2: the binding must carry the specific device chosen from the enumerated list.
    assert.equal(b.providerId, `camera:${world.chosenCamera}`);
    assert.equal(world.bindings.activeProvider(slot(n)), `camera:${world.chosenCamera}`);
    return;
  }
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

// ===========================================================================
// Rule 2 — camera device selection (browser-I/O sweep). The headless models are
// MediaDeviceCatalog (permission + enumeration) and SourceBindingRegistry
// (activeProvider); the browser glue mirrors them from the feed pickers.
// ===========================================================================

const cam = (id: string) => ({ deviceId: id, label: id.toUpperCase(), kind: 'videoinput' as const });
const mic = (id: string) => ({ deviceId: id, label: id.toUpperCase(), kind: 'audioinput' as const });

Given('more than one camera device is enumerated', function (this: MixerWorld) {
  this.catalog.grant('videoinput', [cam('cam-1'), cam('cam-2')]);
});
When('I choose a specific camera from the enumerated list', function (this: MixerWorld) {
  const d = this.catalog.devices('videoinput')[1]!;
  this.chosenCamera = d.deviceId;
  this.lastProvider = `camera:${d.deviceId}`;
  this.bindings.bind(1, 'camera', this.lastProvider);
});
Then("I can re-choose a different camera without changing Source 1's other settings", function (this: MixerWorld) {
  const before = this.snapshot();
  this.bindings.bind(1, 'camera', 'camera:cam-1');
  assert.equal(this.bindings.get(1)!.kind, 'camera');
  // Bindings live outside the store (ADR-0008/0011): the panel state is untouched.
  assert.deepEqual(this.snapshot(), before);
});

Given('Source 4 has no active binding', function (this: MixerWorld) {
  this.bindings.clear(4);
});
// 'Source 4 is selected on the A-bus' is defined in mixer.steps.ts (ASSIGN_SOURCE).
Then('the A-bus receives no video from Source 4', function (this: MixerWorld) {
  assert.equal(this.snapshot().busA.source, 4);
  assert.equal(this.bindings.activeProvider(4), null);
});
Then('selecting a provider for Source 4 restores its video', function (this: MixerWorld) {
  this.bindings.bind(4, 'video', 'file:clip.mp4');
  assert.notEqual(this.bindings.activeProvider(4), null);
});

When('that camera device is disconnected', function (this: MixerWorld) {
  this.bindings.markUnavailable(this.lastProvider);
});
Then('Source 1 reports its binding as unavailable', function (this: MixerWorld) {
  assert.equal(this.bindings.get(1)!.available, false);
});
Then('Source 1 produces no video until it is rebound', function (this: MixerWorld) {
  assert.equal(this.bindings.activeProvider(1), null);
  this.bindings.bind(1, 'camera', 'camera:cam-2');
  assert.notEqual(this.bindings.activeProvider(1), null);
});

// ===========================================================================
// Rule 3 — the External Camera In (DSK key only)
// ===========================================================================

When(/^I bind the External Camera In to a (camera device|video file)$/, function (this: MixerWorld, phrase: string) {
  const kind = phrase === 'camera device' ? ('camera' as const) : ('video' as const);
  this.lastProvider = `${kind}-provider-ext`;
  this.bindings.bindExtCamera(kind, this.lastProvider);
});
Then('the External Camera In supplies the Downstream Key source', function (this: MixerWorld) {
  assert.equal(this.bindings.extCameraAvailable(), true);
});
Then('the External Camera In is not offered as a bus source for Source 1 to 4', function (this: MixerWorld) {
  assert.equal(this.bindings.availableProviders().indexOf(this.lastProvider), -1);
});
Then('the video file supplies the Downstream Key source', function (this: MixerWorld) {
  const b = this.bindings.getExtCamera();
  assert.ok(b && b.kind === 'video' && b.available);
});
Given('the External Camera In has no active binding', function (this: MixerWorld) {
  this.bindings.clearExtCamera();
});
When('the Downstream Key stage requests its key source', function () {});
Then('no key source is available', function (this: MixerWorld) {
  assert.equal(this.bindings.extCameraAvailable(), false);
});
Then('the Downstream Key cannot key until the External Camera In is bound', function (this: MixerWorld) {
  // Clean-modern deviation, stated deliberately: "cannot key" maps to "no CAMERA key
  // source — the composite stands in" (the DEFERRED-mandated fallback).
  assert.equal(dskKeyFeed('ext-camera', this.bindings.extCameraAvailable()), 'composite');
});

// ===========================================================================
// Rule 4 — auxiliary audio inputs
// ===========================================================================

const AUDIO_CHANNEL: Record<string, AudioChannel> = {
  'Aux Audio 1': 'aux1',
  'Aux Audio 2': 'aux2',
  Microphone: 'mic',
  'the Microphone': 'mic',
};
const AUDIO_KIND: Record<string, AudioProviderKind> = {
  'microphone device': 'mic-device',
  'line-in audio device': 'line-device',
  'audio file': 'audio-file',
};

When(/^I bind (Aux Audio 1|Aux Audio 2|the Microphone) to a (microphone device|line-in audio device|audio file)$/, function (
  this: MixerWorld,
  channelPhrase: string,
  kindPhrase: string,
) {
  const channel = AUDIO_CHANNEL[channelPhrase]!;
  const kind = AUDIO_KIND[kindPhrase]!;
  this.lastProvider = `${kind}-1`;
  this.audioBindings.bind(channel, kind, this.lastProvider);
});
Then(/^(Aux Audio 1|Aux Audio 2) supplies audio from that (microphone device|line-in audio device|audio file)$/, function (
  this: MixerWorld,
  channelPhrase: string,
  kindPhrase: string,
) {
  assert.equal(this.audioBindings.get(AUDIO_CHANNEL[channelPhrase]!)!.kind, AUDIO_KIND[kindPhrase]);
});
Then(/^(Aux Audio 1|Aux Audio 2) feeds the Audio Mix section independently of the bus faders$/, function (
  this: MixerWorld,
  channelPhrase: string,
) {
  // Raise standing levels, then move the BUS faders: the aux gains must not move.
  this.dispatch({ type: 'SET_AUDIO_FADER', fader: 'aux1', level: 0.6 });
  this.dispatch({ type: 'SET_AUDIO_FADER', fader: 'micAux2', level: 0.6 });
  const key = AUDIO_CHANNEL[channelPhrase] === 'aux1' ? 'aux1' : 'aux2mic';
  const before = programAudioMix(this.snapshot()).gains[key];
  this.dispatch({ type: 'SET_AUDIO_FADER', fader: 'a', level: 0.9 });
  this.dispatch({ type: 'SET_AUDIO_FADER', fader: 'b', level: 0.1 });
  assert.equal(programAudioMix(this.snapshot()).gains[key], before);
});

Given('the Microphone is bound to a microphone device', function (this: MixerWorld) {
  this.audioBindings.bind('mic', 'mic-device', 'mic-device-1');
});
Given('Aux Audio 2 is bound to an audio file', function (this: MixerWorld) {
  this.audioBindings.bind('aux2', 'audio-file', 'audio-file-2');
});
When(/^the shared fader is switched to (Microphone|Aux Audio 2)$/, function (this: MixerWorld, selected: string) {
  this.dispatch({ type: 'SET_MIC_AUX2_SWITCH', position: selected === 'Microphone' ? 'mic' : 'aux2' });
});
Then(/^the shared fader governs the audio of (Microphone|Aux Audio 2)$/, function (this: MixerWorld, selected: string) {
  assert.equal(micAux2Active(this.snapshot()), selected === 'Microphone' ? 'mic' : 'aux2');
});
Then(/^the audio of (Microphone|Aux Audio 2) does not reach the mix through that fader$/, function (
  this: MixerWorld,
  notSelected: string,
) {
  assert.equal(micAux2Muted(this.snapshot()), notSelected === 'Microphone' ? 'mic' : 'aux2');
  // The switch routes; it never unbinds either channel.
  assert.equal(this.audioBindings.isBound('mic'), true);
  assert.equal(this.audioBindings.isBound('aux2'), true);
});

Given('more than one audio input device is enumerated', function (this: MixerWorld) {
  this.catalog.grant('audioinput', [mic('mic-1'), mic('mic-2')]);
});
When('I choose a specific microphone from the enumerated list', function (this: MixerWorld) {
  const d = this.catalog.devices('audioinput')[1]!;
  this.audioBindings.bind('mic', 'mic-device', d.deviceId);
});
Then('the Microphone supplies audio from the chosen device', function (this: MixerWorld) {
  assert.equal(this.audioBindings.get('mic')!.providerId, 'mic-2');
});

// ===========================================================================
// Rule 5 — permission gating + device-list updates
// ===========================================================================

Given('camera permission has not yet been granted', function (this: MixerWorld) {
  assert.equal(this.catalog.permission('videoinput'), 'prompt');
});
When('I attempt to choose a camera device for a source', function (this: MixerWorld) {
  this.promptShown = this.catalog.requiresPrompt('videoinput');
  this.camerasBeforeGrant = this.catalog.devices('videoinput').length;
});
Then('the browser prompts for camera permission', function (this: MixerWorld) {
  assert.equal(this.promptShown, true);
});
Then('the enumerated camera list is populated only after permission is granted', function (this: MixerWorld) {
  assert.equal(this.camerasBeforeGrant, 0);
  this.catalog.grant('videoinput', [cam('cam-1')]);
  assert.ok(this.catalog.devices('videoinput').length > 0);
});

Given('microphone permission has not yet been granted', function (this: MixerWorld) {
  assert.equal(this.catalog.permission('audioinput'), 'prompt');
});
When('I attempt to choose a microphone device for the Microphone input', function (this: MixerWorld) {
  this.promptShown = this.catalog.requiresPrompt('audioinput');
  this.micsBeforeGrant = this.catalog.devices('audioinput').length;
});
Then('the browser prompts for microphone permission', function (this: MixerWorld) {
  assert.equal(this.promptShown, true);
});
Then('the enumerated microphone list is populated only after permission is granted', function (this: MixerWorld) {
  assert.equal(this.micsBeforeGrant, 0);
  this.catalog.grant('audioinput', [mic('mic-1')]);
  assert.ok(this.catalog.devices('audioinput').length > 0);
});

When('a new camera device is connected', function (this: MixerWorld) {
  if (this.catalog.permission('videoinput') !== 'granted') this.catalog.grant('videoinput', [cam('cam-1')]);
  this.bindingBefore = this.bindings.get(2);
  this.catalog.refresh([...this.catalog.devices('videoinput'), cam('cam-new')]);
});
Then('the newly connected camera appears in the enumerated list', function (this: MixerWorld) {
  assert.ok(this.catalog.devices('videoinput').some((d) => d.deviceId === 'cam-new'));
});
Then('existing bindings remain unchanged', function (this: MixerWorld) {
  assert.deepEqual(this.bindings.get(2), this.bindingBefore);
});
