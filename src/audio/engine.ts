// Browser Web Audio engine (ADR-0010). It realises the audio-mixer graph and drives every
// node gain from the panel state via the pure math in core/audio.ts (programAudioMix,
// micAux2Active). Wired from main.ts, never constructed by the headless engine or the
// specs — an AudioContext has no headless runner here, so this module is typechecked and
// served but excluded from CI (all the *values* it pushes are unit-tested in core/audio).
//
// This recreation has no real media inputs, so each input is a stand-in oscillator at a
// distinct pitch; the fader / Mic-Aux2 switch / master topology is the faithful part. The
// context starts suspended (browsers require a gesture) — call resume() from a user gesture.

import { micAux2Active } from '../core/audio.js';
import { programFadeAudioMix } from '../core/fade.js';
import type { PanelStore, Unsubscribe } from '../state/store.js';
import type { PanelState } from '../state/state.js';

/** Distinct stand-in pitches (Hz) so each input is recognisable on its own fader. */
const PITCH = { busA: 220, busB: 277.18, aux1: 329.63, mic: 440, aux2: 392 } as const;
/** Smoothing time-constant for gain changes (seconds) — avoids zipper noise. */
const RAMP = 0.02;

export class AudioEngine {
  private readonly ctx: AudioContext;
  private readonly gBusA: GainNode;
  private readonly gBusB: GainNode;
  private readonly gAux1: GainNode;
  private readonly gAux2Mic: GainNode;
  private readonly gMicSelect: GainNode;
  private readonly gAux2Select: GainNode;
  private readonly master: GainNode;
  private readonly analyser: AnalyserNode;
  private readonly envBuf: Float32Array<ArrayBuffer>;
  private readonly unsubscribe: Unsubscribe;

  constructor(store: PanelStore) {
    this.ctx = new AudioContext();
    const ctx = this.ctx;

    const mix = ctx.createGain();
    this.master = ctx.createGain();
    this.analyser = ctx.createAnalyser();
    this.analyser.fftSize = 1024;
    this.envBuf = new Float32Array(new ArrayBuffer(this.analyser.fftSize * Float32Array.BYTES_PER_ELEMENT));

    this.gBusA = ctx.createGain();
    this.gBusB = ctx.createGain();
    this.gAux1 = ctx.createGain();
    this.gAux2Mic = ctx.createGain();
    this.gMicSelect = ctx.createGain();
    this.gAux2Select = ctx.createGain();

    // Stand-in input oscillators → their fader gains → the mix bus.
    this.voice(PITCH.busA, this.gBusA, mix);
    this.voice(PITCH.busB, this.gBusB, mix);
    this.voice(PITCH.aux1, this.gAux1, mix);
    // Mic and Aux 2 share one fader (gAux2Mic); the front-panel switch selects one.
    this.voice(PITCH.mic, this.gMicSelect, this.gAux2Mic);
    this.voice(PITCH.aux2, this.gAux2Select, this.gAux2Mic);
    this.gAux2Mic.connect(mix);

    mix.connect(this.master);
    this.master.connect(this.analyser);
    this.analyser.connect(ctx.destination);

    this.sync(store.getSnapshot());
    this.unsubscribe = store.subscribe((next) => this.sync(next));
  }

  /** One stand-in input: a continuously-running oscillator behind a gain node. */
  private voice(hz: number, gain: GainNode, dest: AudioNode): void {
    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = hz;
    gain.gain.value = 0;
    osc.connect(gain);
    gain.connect(dest);
    osc.start();
  }

  private ramp(param: AudioParam, value: number): void {
    param.setTargetAtTime(value, this.ctx.currentTime, RAMP);
  }

  /** Push the panel state's routing + fader gains (post-Fade) onto the graph (reference §2, §5, §11, §12). */
  private sync(state: PanelState): void {
    const { gains, master } = programFadeAudioMix(state);
    this.ramp(this.gBusA.gain, gains.busA);
    this.ramp(this.gBusB.gain, gains.busB);
    this.ramp(this.gAux1.gain, gains.aux1);
    this.ramp(this.gAux2Mic.gain, gains.aux2mic);
    const active = micAux2Active(state);
    this.ramp(this.gMicSelect.gain, active === 'mic' ? 1 : 0);
    this.ramp(this.gAux2Select.gain, active === 'aux2' ? 1 : 0);
    this.ramp(this.master.gain, master);
  }

  /** The current programme envelope (RMS, 0..1) — feeds the LED meter and A/V Synchro tap. */
  envelope(): number {
    this.analyser.getFloatTimeDomainData(this.envBuf);
    let sum = 0;
    for (const sample of this.envBuf) sum += sample * sample;
    return Math.sqrt(sum / this.envBuf.length);
  }

  /** Resume the context from a user gesture (browsers start it suspended). */
  async resume(): Promise<void> {
    if (this.ctx.state !== 'running') await this.ctx.resume();
  }

  dispose(): void {
    this.unsubscribe();
    void this.ctx.close();
  }
}
