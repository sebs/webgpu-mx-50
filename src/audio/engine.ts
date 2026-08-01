// Browser Web Audio engine (ADR-0010). It realises the audio-mixer graph and drives every
// node gain from the panel state via the pure math in core (programFadeSourceMix,
// micAux2Active, micCaptureWanted). Wired from main.ts, never constructed by the headless
// engine or the specs — an AudioContext has no headless runner here, so this module is
// typechecked and served but excluded from CI (every *value* it pushes is unit-tested).
//
// Real capture (browser-I/O sweep): the four Source slots tap their feed videos via
// once-per-element MediaElementAudioSourceNodes (created inside the gesture-driven
// resume(); the tap reroutes element output into the graph, so elements are unmuted there
// — audibility is then governed solely by the faders, which boot at zero). The mic is a
// demand-driven getUserMedia stream behind the MIC/AUX2 switch. Aux1/Aux2 keep stand-in
// oscillators (no browser line-in jack exists; silence would leave two console faders
// dead) idling behind zeroed faders. The mic deliberately has NO oscillator fallback — a
// fake tone masquerading as a live microphone would mislead; denial is audibly nothing.

import { micAux2Active, micCaptureWanted } from '../core/audio.js';
import { programFadeSourceMix } from '../core/fade.js';
import type { SourceSlot } from '../core/types.js';
import type { PanelStore, Unsubscribe } from '../state/store.js';
import type { PanelState } from '../state/state.js';

/** Stand-in pitches (Hz) for the aux inputs that have no browser jack. */
const PITCH = { aux1: 329.63, aux2: 392 } as const;
/** Smoothing time-constant for gain changes (seconds) — avoids zipper noise. */
const RAMP = 0.02;

const SLOTS: readonly SourceSlot[] = [1, 2, 3, 4];

export interface AudioInputProvider {
  /** Feed element backing a Source slot (stable element identity for the app's life; ADR-0008). */
  sourceElement(slot: SourceSlot): HTMLMediaElement | null;
  /** Acquire the microphone (permission prompt); rejects on denial/absence. */
  acquireMic(): Promise<MediaStream>;
}

export type MicStatus = 'idle' | 'pending' | 'live' | 'denied';

export class AudioEngine {
  private readonly ctx: AudioContext;
  private readonly gSource = new Map<SourceSlot, GainNode>();
  private readonly taps = new Map<SourceSlot, MediaElementAudioSourceNode>();
  private readonly slotStreams = new Map<SourceSlot, MediaStreamAudioSourceNode>();
  private readonly gAux1: GainNode;
  private readonly gAux2Mic: GainNode;
  private readonly gMicSelect: GainNode;
  private readonly gAux2Select: GainNode;
  private readonly master: GainNode;
  private readonly analyser: AnalyserNode;
  private readonly envBuf: Float32Array<ArrayBuffer>;
  private readonly unsubscribe: Unsubscribe;
  private micState: MicStatus = 'idle';
  private micStream: MediaStream | null = null;
  private inputsAttached = false;

  constructor(
    store: PanelStore,
    private readonly inputs: AudioInputProvider | null = null,
  ) {
    this.ctx = new AudioContext();
    const ctx = this.ctx;

    const mix = ctx.createGain();
    this.master = ctx.createGain();
    this.analyser = ctx.createAnalyser();
    this.analyser.fftSize = 1024;
    this.envBuf = new Float32Array(new ArrayBuffer(this.analyser.fftSize * Float32Array.BYTES_PER_ELEMENT));

    // Per-slot source gains → the mix bus (the taps attach lazily in resume()).
    for (const slot of SLOTS) {
      const gain = ctx.createGain();
      gain.gain.value = 0;
      gain.connect(mix);
      this.gSource.set(slot, gain);
    }

    this.gAux1 = ctx.createGain();
    this.gAux2Mic = ctx.createGain();
    this.gMicSelect = ctx.createGain();
    this.gAux2Select = ctx.createGain();

    // Aux 1 stand-in; Mic (live, lazily attached) and the Aux 2 stand-in share one fader
    // (gAux2Mic) — the front-panel switch selects one via the select gains.
    this.voice(PITCH.aux1, this.gAux1, mix);
    this.gMicSelect.connect(this.gAux2Mic);
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

  /** Push the panel state's routing + fader gains (post-Fade) onto the graph. */
  private sync(state: PanelState): void {
    const mix = programFadeSourceMix(state);
    for (const slot of SLOTS) this.ramp(this.gSource.get(slot)!.gain, mix.slots[slot]);
    this.ramp(this.gAux1.gain, mix.aux1);
    this.ramp(this.gAux2Mic.gain, mix.aux2mic);
    const active = micAux2Active(state);
    this.ramp(this.gMicSelect.gain, active === 'mic' ? 1 : 0);
    this.ramp(this.gAux2Select.gain, active === 'aux2' ? 1 : 0);
    this.ramp(this.master.gain, mix.master);
    this.maybeAcquireMic(state);
  }

  /**
   * Lazy element taps, invoked from resume() so they run in a user-gesture context.
   * createMediaElementSource is once-per-element (cached); it reroutes the element's
   * output into the graph, so the element is unmuted here — audibility is governed
   * solely by the faders. The silent canvas Pattern case needs no special-casing: no
   * audio track → silence is the correct signal, and a loaded clip's audio flows
   * through the same tap instantly.
   */
  private attachInputs(): void {
    if (this.inputsAttached || !this.inputs) return;
    this.inputsAttached = true;
    for (const slot of SLOTS) {
      const el = this.inputs.sourceElement(slot);
      if (!el || this.taps.has(slot)) continue;
      try {
        const tap = this.ctx.createMediaElementSource(el);
        tap.connect(this.gSource.get(slot)!);
        this.taps.set(slot, tap);
        el.muted = false;
      } catch {
        // InvalidStateError (already tapped elsewhere): the slot stays silent.
      }
    }
  }

  /** Demand-driven mic acquisition; denial parks sticky until retryMic(). */
  private maybeAcquireMic(state: PanelState): void {
    if (this.micState !== 'idle' || !this.inputs || !micCaptureWanted(state)) return;
    this.micState = 'pending';
    this.inputs.acquireMic().then(
      (stream) => {
        this.micStream = stream;
        const head = this.ctx.createMediaStreamSource(stream);
        head.connect(this.gMicSelect);
        this.micState = 'live';
        const track = stream.getAudioTracks()[0];
        if (track) {
          track.addEventListener('ended', () => {
            this.micState = 'idle'; // device unplugged: re-acquire on the next demand
            this.micStream = null;
          });
        }
      },
      () => {
        this.micState = 'denied';
      },
    );
  }

  /** Reserved head swap for camera-backed slots (MediaStream audio bypasses element taps). */
  attachSlotStream(slot: SourceSlot, stream: MediaStream | null): void {
    const prev = this.slotStreams.get(slot);
    if (prev) {
      prev.disconnect();
      this.slotStreams.delete(slot);
    }
    if (stream && stream.getAudioTracks().length > 0) {
      const head = this.ctx.createMediaStreamSource(stream);
      head.connect(this.gSource.get(slot)!);
      this.slotStreams.set(slot, head);
    }
  }

  micStatus(): MicStatus {
    return this.micState;
  }

  /** Denied → idle, so the next demand re-prompts (a fresh operator decision). */
  retryMic(): void {
    if (this.micState === 'denied') this.micState = 'idle';
  }

  /** The current programme envelope (RMS, 0..1) — feeds the LED meter and A/V Synchro tap. */
  envelope(): number {
    this.analyser.getFloatTimeDomainData(this.envBuf);
    let sum = 0;
    for (const sample of this.envBuf) sum += sample * sample;
    return Math.sqrt(sum / this.envBuf.length);
  }

  /** Resume the context from a user gesture, then attach the element taps (gesture context). */
  async resume(): Promise<void> {
    if (this.ctx.state !== 'running') await this.ctx.resume();
    this.attachInputs();
  }

  dispose(): void {
    this.unsubscribe();
    if (this.micStream) for (const track of this.micStream.getTracks()) track.stop();
    // Re-mute tapped elements: their audio would otherwise stay routed into a closed graph.
    if (this.inputs) {
      for (const slot of SLOTS) {
        const el = this.inputs.sourceElement(slot);
        if (el && this.taps.has(slot)) el.muted = true;
      }
    }
    void this.ctx.close();
  }
}
