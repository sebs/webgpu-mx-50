// The resolver (ADR-0014): the ONLY code that turns a normalised ControlSignal into a store
// Command. Pure — (signal, state, tick) -> Command | null — it reads only the passed state and
// tick (the clock is never touched here; the caller passes clock.tick, mirroring timeline.ts).
// Every input surface converges here, so the store sees one vocabulary regardless of origin.
//
// banira lib floor: local clamp helpers, Map for coalescing (no Array.includes / **).

import type { Command } from '../state/commands.js';
import type { PanelState, ProgramOut, TransitionType } from '../state/state.js';
import type { BusSource } from '../core/types.js';
import type { ControlMode, ControlSignal } from './logical-control.js';

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);
const clampSigned = (v: number): number => (v < -1 ? -1 : v > 1 ? 1 : v);

/** Program Out cycles A → B → EFFECT → A on a toggle. */
function nextProgramOut(current: ProgramOut): ProgramOut {
  return current === 'A' ? 'B' : current === 'B' ? 'effect' : 'A';
}
/** Transition type cycles mix → nam → wipe → mix on a toggle (a key mode returns to mix). */
function nextTransitionType(current: TransitionType): TransitionType {
  return current === 'mix' ? 'nam' : current === 'nam' ? 'wipe' : 'mix';
}

/** Absolute-or-relative continuous set, clamped to 0..1. */
function continuous(mode: ControlMode, value: number, current: number): number | null {
  if (mode === 'set') return clamp01(value);
  if (mode === 'nudge') return clamp01(current + value);
  return null;
}

/**
 * Resolve one logical-control signal to exactly one store Command, or null when the
 * (control, mode) pairing is meaningless (e.g. a `set` on a trigger, a `trigger` on a fader).
 */
export function resolveSignal(signal: ControlSignal, state: PanelState, tick: number): Command | null {
  const { control, mode } = signal;
  const v = signal.value ?? 0;
  switch (control) {
    case 'autoTake.trigger':
      return mode === 'trigger' ? { type: 'PRESS_AUTO_TAKE', tick } : null;
    case 'autoFade.trigger':
      return mode === 'trigger' ? { type: 'PRESS_AUTO_FADE', tick } : null;
    case 'lever.position': {
      const position = continuous(mode, v, state.transition.lever);
      return position === null ? null : { type: 'SET_LEVER', position };
    }
    case 'fade.lever': {
      const position = continuous(mode, v, state.fade.lever);
      return position === null ? null : { type: 'SET_FADE_LEVER', position };
    }
    case 'transitionTime':
      if (mode === 'set') return { type: 'SET_TRANSITION_TIME', frames: v };
      if (mode === 'nudge') return { type: 'SET_TRANSITION_TIME', frames: state.transitionFrames + v };
      return null;
    case 'busA.source':
      return mode === 'set' ? { type: 'ASSIGN_SOURCE', bus: 'A', source: v as BusSource } : null;
    case 'busB.source':
      return mode === 'set' ? { type: 'ASSIGN_SOURCE', bus: 'B', source: v as BusSource } : null;
    case 'programOut':
      return mode === 'toggle' ? { type: 'SET_PROGRAM_OUT', mode: nextProgramOut(state.programOut) } : null;
    case 'transition.type':
      return mode === 'toggle' ? { type: 'SET_TRANSITION_TYPE', transition: nextTransitionType(state.transition.type) } : null;
    case 'key.slice':
      return mode === 'set' ? { type: 'SET_SLICE', value: clamp01(v) } : null;
    case 'key.hue':
      return mode === 'set' ? { type: 'SET_HUE', angle: v } : null;
    case 'positioner.x':
      return mode === 'set' ? { type: 'SET_POSITIONER_JOYSTICK', x: clampSigned(v), y: state.positioner.y } : null;
    case 'positioner.y':
      return mode === 'set' ? { type: 'SET_POSITIONER_JOYSTICK', x: state.positioner.x, y: clampSigned(v) } : null;
    case 'positioner.size':
      return mode === 'set' ? { type: 'SET_POSITIONER_SIZE', value: clamp01(v) } : null;
    case 'ccA.chroma': {
      const value = continuous(mode, v, state.busA.colourCorrect.chroma);
      return value === null ? null : { type: 'SET_CHROMA', bus: 'A', value };
    }
    case 'ccB.chroma': {
      const value = continuous(mode, v, state.busB.colourCorrect.chroma);
      return value === null ? null : { type: 'SET_CHROMA', bus: 'B', value };
    }
    case 'audio.a':
      return faderCommand(mode, v, state.audio.faders.a, 'a');
    case 'audio.b':
      return faderCommand(mode, v, state.audio.faders.b, 'b');
    case 'audio.aux1':
      return faderCommand(mode, v, state.audio.faders.aux1, 'aux1');
    case 'audio.micAux2':
      return faderCommand(mode, v, state.audio.faders.micAux2, 'micAux2');
    case 'audio.master':
      return faderCommand(mode, v, state.audio.faders.master, 'master');
    default: {
      const _never: never = control;
      return _never;
    }
  }
}

function faderCommand(mode: ControlMode, value: number, current: number, fader: 'a' | 'b' | 'aux1' | 'micAux2' | 'master'): Command | null {
  const level = continuous(mode, value, current);
  return level === null ? null : { type: 'SET_AUDIO_FADER', fader, level };
}

/**
 * Coalesces a burst of continuous signals to at most one Command per control per tick so a
 * flood of gamepad/MIDI updates never outruns the frame (ADR-0012): `set` is last-wins, `nudge`
 * deltas sum, `trigger`/`toggle` stay distinct pulses. `flush` is the render loop's sole caller
 * of resolveSignal.
 */
export class SignalCoalescer {
  private readonly pending = new Map<string, ControlSignal>();
  private readonly pulses: ControlSignal[] = [];

  push(signal: ControlSignal): void {
    if (signal.mode === 'trigger' || signal.mode === 'toggle') {
      this.pulses.push(signal);
      return;
    }
    if (signal.mode === 'nudge') {
      const prev = this.pending.get(signal.control);
      const base = prev && prev.mode === 'nudge' ? (prev.value ?? 0) : 0;
      this.pending.set(signal.control, { control: signal.control, mode: 'nudge', value: base + (signal.value ?? 0) });
      return;
    }
    this.pending.set(signal.control, signal); // set: last-wins
  }

  flush(state: PanelState, tick: number, dispatch: (command: Command) => void): void {
    for (const signal of this.pulses) {
      const command = resolveSignal(signal, state, tick);
      if (command) dispatch(command);
    }
    this.pulses.length = 0;
    for (const signal of this.pending.values()) {
      const command = resolveSignal(signal, state, tick);
      if (command) dispatch(command);
    }
    this.pending.clear();
  }
}
