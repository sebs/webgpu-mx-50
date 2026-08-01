import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FACTORY_PRESET } from '../../src/state/state.js';
import type { FadeState, PanelState } from '../../src/state/state.js';
import { matteFlatColor } from '../../src/core/matte.js';
import { resolveBusSource } from '../../src/core/resolve.js';
import { faderGain } from '../../src/core/audio.js';
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
  HEADPHONE_MONITOR_BYPASSES_FADE,
} from '../../src/core/fade.js';

const fresh = (): PanelState => structuredClone(FACTORY_PRESET);
const withFade = (partial: Partial<FadeState>): PanelState => {
  const s = fresh();
  s.fade = { ...s.fade, ...partial };
  return s;
};
/** The desk boots silent (all faders at zero) — audio-routing checks need standing levels. */
const raised = (s: PanelState): PanelState => {
  s.audio = { ...s.audio, faders: { a: 0.7, b: 0.4, aux1: 0.6, micAux2: 0.6, master: 0.75 } };
  return s;
};

// --- video target ---

test('fadeVideoTarget resolves each target', () => {
  assert.deepEqual(fadeVideoTarget(withFade({ target: 'white' })), { kind: 'colour', rgb: [1, 1, 1] });
  assert.deepEqual(fadeVideoTarget(withFade({ target: 'black' })), { kind: 'colour', rgb: [0, 0, 0] });
  const matte = withFade({ target: 'matte' });
  matte.matte = { ...matte.matte, colorIndex: 6 }; // Red
  assert.deepEqual(fadeVideoTarget(matte), { kind: 'colour', rgb: matteFlatColor(matte.matte) });
  const a = fadeVideoTarget(withFade({ target: 'A' }));
  assert.deepEqual(a, { kind: 'bus', bus: 'A', source: resolveBusSource(fresh().busA, 'fade'), effected: false });
});

test('fade to a Matte bus resolves the blinking substitute, never the Matte itself', () => {
  const s = withFade({ target: 'A' });
  s.busA = { ...s.busA, source: 'matte', substituteSource: 3 };
  const t = fadeVideoTarget(s);
  assert.equal(t.kind, 'bus');
  if (t.kind === 'bus') assert.equal(t.source, 3);
});

// --- amounts / enables ---

test('elementFadeAmount and isFading gate on the enable and the lever', () => {
  const s = withFade({ video: true, lever: 0.5 });
  assert.equal(elementFadeAmount(s.fade, 'video'), 0.5);
  assert.equal(elementFadeAmount(s.fade, 'dsk'), 0); // unlit
  assert.equal(isFading(s.fade), true);
  assert.equal(isFading(withFade({ video: true, lever: 0 }).fade), false); // lever at IN
  assert.equal(isFading(withFade({ video: false, lever: 1 }).fade), false); // no enable lit
  assert.equal(videoFadeAmount(withFade({ video: true, lever: 1 }).fade), 1);
});

// --- LEDs ---

test('fadeLeverLeds are solid at the extremes and blink while incomplete', () => {
  assert.deepEqual(fadeLeverLeds(0), { in: 'solid', out: 'off' });
  assert.deepEqual(fadeLeverLeds(1), { in: 'off', out: 'solid' });
  assert.deepEqual(fadeLeverLeds(0.5), { in: 'blink', out: 'blink' });
  assert.equal(fadeIncomplete(0.5), true);
  assert.equal(fadeIncomplete(0), false);
  assert.equal(fadeIncomplete(1), false);
});

test('fadeEnableLed is off when unlit, solid when lit, and blinks while the Auto Fade is paused', () => {
  assert.equal(fadeEnableLed(withFade({ video: false }).fade, 'video'), 'off');
  assert.equal(fadeEnableLed(withFade({ video: true }).fade, 'video'), 'solid');
  const paused = withFade({ video: true });
  paused.fade = { ...paused.fade, auto: { ...paused.fade.auto, phase: 'paused' } };
  assert.equal(fadeEnableLed(paused.fade, 'video'), 'blink');
});

// --- fade-aware audio ---

test('with AUDIO off (or lever IN) the program audio is the untouched mixer output', () => {
  const base = programFadeAudioMix(fresh());
  assert.equal(base.gains.busA, faderGain(fresh().audio.faders.a));
  const inLever = withFade({ audio: true, lever: 0, target: 'black' });
  assert.deepEqual(programFadeAudioMix(inLever), programFadeAudioMix(fresh()));
});

test('fading to a card silences the program audio at OUT', () => {
  for (const target of ['matte', 'white', 'black'] as const) {
    const s = withFade({ audio: true, lever: 1, target });
    assert.equal(programFadeAudible(s), false, target);
    const g = programFadeAudioMix(s).gains;
    assert.ok(g.busA === 0 && g.busB === 0 && g.aux1 === 0 && g.aux2mic === 0, target);
  }
});

test('fading to a bus keeps that bus + aux and drops the other bus at OUT', () => {
  const toA = programFadeAudioMix(raised(withFade({ audio: true, lever: 1, target: 'A' }))).gains;
  assert.ok(toA.busA > 0 && toA.busB === 0 && toA.aux1 > 0 && toA.aux2mic > 0);
  const toB = programFadeAudioMix(raised(withFade({ audio: true, lever: 1, target: 'B' }))).gains;
  assert.ok(toB.busB > 0 && toB.busA === 0 && toB.aux1 > 0 && toB.aux2mic > 0);
  assert.equal(programFadeAudible(raised(withFade({ audio: true, lever: 1, target: 'B' }))), true);
});

test('the headphone monitor is documented as pre-fade (never attenuated)', () => {
  assert.equal(HEADPHONE_MONITOR_BYPASSES_FADE, true);
});
