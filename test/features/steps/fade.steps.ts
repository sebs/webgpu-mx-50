// Step definitions for fade-control.feature (reference §11). The Fade stage is pure domain
// (core/fade.ts): the fade lever is state.fade.lever (written by the Auto Fade runner, never
// derived), so every assertion reads the snapshot directly. Auto Fade time is advanced
// headlessly via the World (advanceFrames → ADVANCE_TIMELINE). Shared TRANSITION-set steps
// live in timeline.steps.ts; the video-present/aux-present audio steps are reused (and made
// fade-aware) from mixer.steps.ts.

import { Given, When, Then } from '@cucumber/cucumber';
import assert from 'node:assert/strict';
import type { MixerWorld } from '../support/world.js';
import type { FadeElement, FadeTarget } from '../../../src/state/state.js';
import { matteFlatColor } from '../../../src/core/matte.js';
import { resolveBusSource } from '../../../src/core/resolve.js';
import { stageIsBefore, STAGE_ORDER } from '../../../src/core/signal-graph.js';
import { runnerComplete } from '../../../src/core/timeline.js';
import {
  elementFadeAmount,
  isFading,
  videoFadeAmount,
  fadeVideoTarget,
  fadeLeverLeds,
  fadeIncomplete,
  fadeEnableLed,
  programFadeAudioMix,
  programFadeAudible,
  dskTitleOpacity,
  HEADPHONE_MONITOR_BYPASSES_FADE,
} from '../../../src/core/fade.js';

const ELEMENTS: FadeElement[] = ['video', 'dsk', 'audio'];
const el = (label: string): FadeElement => label.toLowerCase() as FadeElement;
const fadeTarget = (word: string): FadeTarget => (word.length === 1 ? (word as FadeTarget) : (word.toLowerCase() as FadeTarget));
const fade = (w: MixerWorld) => w.snapshot().fade;
const setEnable = (w: MixerWorld, element: FadeElement, on: boolean) => w.dispatch({ type: 'SET_FADE_ENABLE', element, on });

// --- Background ---

Given('the fully effected composite is present at the Fade stage input', function () {});
Given('a Downstream Key title is keyed over the composite', function (this: MixerWorld) {
  this.dispatch({ type: 'SET_DSK_ON', on: true });
});
Given('program output is set to EFFECT', function (this: MixerWorld) {
  this.dispatch({ type: 'SET_PROGRAM_OUT', mode: 'effect' });
});

// --- Enables ---

Given(/^only the (VIDEO|DSK|AUDIO) enable button is lit$/, function (this: MixerWorld, name: string) {
  for (const e of ELEMENTS) setEnable(this, e, e === el(name));
});
Given(/^the (VIDEO|DSK|AUDIO) enable button is (lit|unlit)$/, function (this: MixerWorld, name: string, state: string) {
  setEnable(this, el(name), state === 'lit');
});
Given('none of the VIDEO, DSK, AUDIO enable buttons are lit', function (this: MixerWorld) {
  for (const e of ELEMENTS) setEnable(this, e, false);
});
Given('the VIDEO, DSK and AUDIO enable buttons are all lit', function (this: MixerWorld) {
  for (const e of ELEMENTS) setEnable(this, e, true);
});

// --- Target ---

Given(/^the fade target is (MATTE|WHITE|BLACK|A|B)$/, function (this: MixerWorld, word: string) {
  this.dispatch({ type: 'SET_FADE_TARGET', target: fadeTarget(word) });
});

// --- Lever ---

When(/^I move the Fade Control lever (?:from IN to OUT|fully to OUT)$/, function (this: MixerWorld) {
  this.dispatch({ type: 'SET_FADE_LEVER', position: 1 });
});
When(/^I move the Fade Control lever (?:partway toward OUT|to the halfway position)$/, function (this: MixerWorld) {
  this.dispatch({ type: 'SET_FADE_LEVER', position: 0.5 });
});
Given(/^the Fade Control lever is (?:fully )?at (IN|OUT)$/, function (this: MixerWorld, extreme: string) {
  this.dispatch({ type: 'SET_FADE_LEVER', position: extreme === 'IN' ? 0 : 1 });
});

// --- Participation ---

Then('the program output is unchanged', function (this: MixerWorld) {
  assert.equal(isFading(fade(this)), false);
});
Then('nothing fades', function (this: MixerWorld) {
  assert.equal(isFading(fade(this)), false);
});
Then(/^the (VIDEO|DSK|AUDIO) element is fully faded out$/, function (this: MixerWorld, name: string) {
  assert.equal(elementFadeAmount(fade(this), el(name)), 1);
});
Then('the elements whose enable buttons are unlit are unchanged', function (this: MixerWorld) {
  const f = fade(this);
  for (const e of ELEMENTS) if (!f[e]) assert.equal(elementFadeAmount(f, e), 0);
});
Then('the video, the DSK title and the program audio all fade out together', function (this: MixerWorld) {
  const f = fade(this);
  for (const e of ELEMENTS) assert.equal(elementFadeAmount(f, e), 1);
});

// --- Manual lever LEDs ---

Then(/^the (IN|OUT) LED is (solid|off)$/, function (this: MixerWorld, which: string, expected: string) {
  const leds = fadeLeverLeds(fade(this).lever);
  assert.equal(which === 'IN' ? leds.in : leds.out, expected);
});
Then('the IN and OUT LEDs blink', function (this: MixerWorld) {
  const leds = fadeLeverLeds(fade(this).lever);
  assert.equal(leds.in, 'blink');
  assert.equal(leds.out, 'blink');
});
Then('the fade is incomplete', function (this: MixerWorld) {
  assert.equal(fadeIncomplete(fade(this).lever), true);
});

// --- Video result (one consolidated step; branch on the description) ---

Then(/^the program video is (.+)$/, function (this: MixerWorld, desc: string) {
  const s = this.snapshot();
  const half = desc.match(/50 percent mix of the composite and (\w+)/);
  if (half) {
    assert.equal(videoFadeAmount(s.fade), 0.5);
    assert.equal(s.fade.target, fadeTarget(half[1]!.toUpperCase()));
    return;
  }
  const t = fadeVideoTarget(s);
  if (/white/i.test(desc)) {
    assert.deepEqual(t, { kind: 'colour', rgb: [1, 1, 1] });
  } else if (/matte/i.test(desc)) {
    assert.equal(t.kind, 'colour');
    if (t.kind === 'colour') assert.deepEqual(t.rgb, matteFlatColor(s.matte));
  } else if (/black/i.test(desc)) {
    assert.deepEqual(t, { kind: 'colour', rgb: [0, 0, 0] });
  } else if (/A-bus/.test(desc)) {
    assert.equal(t.kind, 'bus');
    if (t.kind === 'bus') {
      assert.equal(t.bus, 'A');
      assert.equal(t.effected, false);
      assert.equal(t.source, resolveBusSource(s.busA, 'fade'));
    }
  } else if (/B-bus/.test(desc)) {
    assert.equal(t.kind, 'bus');
    if (t.kind === 'bus') {
      assert.equal(t.bus, 'B');
      assert.equal(t.source, resolveBusSource(s.busB, 'fade'));
    }
  } else {
    throw new Error(`unhandled program video description: ${desc}`);
  }
});

// --- Audio by target ---

Then('the program audio is silenced', function (this: MixerWorld) {
  assert.equal(programFadeAudible(this.snapshot()), false);
});
Then(/^the program audio is the (A|B)-bus audio$/, function (this: MixerWorld, bus: string) {
  const g = programFadeAudioMix(this.snapshot()).gains;
  if (bus === 'A') assert.ok(g.busA > 0 && g.busB === 0);
  else assert.ok(g.busB > 0 && g.busA === 0);
});
Then(/^Aux 1 and Aux 2\/Mic audio persist in the program output$/, function (this: MixerWorld) {
  const g = programFadeAudioMix(this.snapshot()).gains;
  assert.ok(g.aux1 > 0 && g.aux2mic > 0);
});
Then('the headphone monitor output is unaffected by the fade', function () {
  assert.equal(HEADPHONE_MONITOR_BYPASSES_FADE, true);
});

// --- Final-stage invariants ---

Then('the fade is applied to the post-DSK composite', function () {
  assert.equal(stageIsBefore('downstream-key', 'fade'), true);
});
Then('no stage after the Fade stage modifies the video before Program Out', function () {
  assert.equal(STAGE_ORDER[STAGE_ORDER.length - 1], 'fade');
});

// --- Auto Fade ---

Then(/^the Auto Fade Time indicator shows (\d+) frames$/, function (this: MixerWorld, n: string) {
  assert.equal(this.snapshot().transitionFrames, Number(n));
});
Then('the value is quantised to a 2-frame step', function (this: MixerWorld) {
  assert.equal(this.snapshot().transitionFrames % 2, 0);
});
Then('the value is clamped to the range 0 to 510 frames', function (this: MixerWorld) {
  const f = this.snapshot().transitionFrames;
  assert.ok(f >= 0 && f <= 510);
});
When(/^I press AUTO FADE(?: again)?(?: mid-fade)?$/, function (this: MixerWorld) {
  this.pressAutoFade();
});
Given('an Auto Fade is in progress', function (this: MixerWorld) {
  setEnable(this, 'video', true);
  this.setTransitionTime(60);
  this.pressAutoFade();
  this.advanceFrames(30);
});
Given('an Auto Fade is paused mid-fade', function (this: MixerWorld) {
  setEnable(this, 'video', true);
  this.setTransitionTime(60);
  this.pressAutoFade();
  this.advanceFrames(30);
  this.pressAutoFade(); // pause
});
Then(/^the program video fades to black over (\d+) frames$/, function (this: MixerWorld, n: string) {
  this.advanceToFrame(Number(n));
  assert.equal(runnerComplete(fade(this).auto), true);
  assert.equal(fade(this).lever, 1);
  assert.equal(fade(this).target, 'black');
});
Then('the fade completes at the OUT position', function (this: MixerWorld) {
  assert.equal(fade(this).lever, 1);
  assert.equal(runnerComplete(fade(this).auto), true);
});
Then('the fade pauses at its current position', function (this: MixerWorld) {
  const held = fade(this).lever;
  this.advanceFrames(5);
  assert.equal(fade(this).auto.phase, 'paused');
  assert.equal(fade(this).lever, held);
});
Then("the enabled element's LED blinks to indicate the pause", function (this: MixerWorld) {
  assert.equal(fadeEnableLed(fade(this), 'video'), 'blink');
});
Then('the fade resumes from its paused position', function (this: MixerWorld) {
  assert.equal(fade(this).auto.phase, 'running');
});
Then('it completes over the remaining portion of the transition time', function (this: MixerWorld) {
  this.advanceFrames(60);
  assert.equal(runnerComplete(fade(this).auto), true);
  assert.equal(fade(this).lever, 1);
});

// --- Selective fading (§11): VIDEO-only leaves the title; DSK-only removes only it ---

Then('the program video fades to black', function (this: MixerWorld) {
  const s = this.snapshot();
  assert.equal(videoFadeAmount(s.fade), 1);
  assert.deepEqual(fadeVideoTarget(s), { kind: 'colour', rgb: [0, 0, 0] });
});
Then('the DSK title remains fully on screen', function (this: MixerWorld) {
  assert.equal(dskTitleOpacity(this.snapshot()), 1);
});
Then('the DSK title fades off screen', function (this: MixerWorld) {
  assert.equal(dskTitleOpacity(this.snapshot()), 0);
});
Then('the composite picture remains at full level', function (this: MixerWorld) {
  assert.equal(videoFadeAmount(this.snapshot().fade), 0);
});
