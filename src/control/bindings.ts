// The binding table (ADR-0014): DATA, not code. It maps a physical-input address (a key chord,
// a gamepad axis/button, a MIDI note/CC, the serial GPI) to a logical control + mode. Ships with
// sensible defaults, is remappable at runtime, and is persisted via ADR-0015 (its own storage
// key) — so a user's remap survives reloads. The only opinion baked in code is DEFAULT_BINDINGS.
//
// banira lib floor: index/`in`/`===` only — no Array.includes, no `**`.

import type { ControlMode, LogicalControlId } from './logical-control.js';

/** A binding: what a physical input drives, and how. */
export interface Binding {
  readonly control: LogicalControlId;
  readonly mode: ControlMode;
  /** Fixed value for `set`/`nudge`/`trigger` bindings whose input carries no analog value (e.g. a key). */
  readonly value?: number;
  /** Input range for continuous adapters to normalise into 0..1 before building the signal. */
  readonly range?: { readonly lo: number; readonly hi: number };
  /** Response curve applied by the adapter ('square' uses v*v — never the ** operator). */
  readonly curve?: 'linear' | 'square';
  /** Continuous input is relative (velocity/encoder) rather than absolute. */
  readonly relative?: boolean;
  /** MIDI 14-bit CC (ADR-0018): pair CC n (MSB) with CC n+32 (LSB) for 16384-step resolution. */
  readonly fine?: boolean;
}

/** address (e.g. "key:Space", "gamepad:axis/1", "midi:cc/0/7", "serial:gpi") → binding. */
export type BindingMap = { [address: string]: Binding };

/**
 * The ships-with defaults. GPI/keyboard/gamepad/MIDI all reach Auto Take, mirroring the
 * hardware GPI-fires-Auto-Take intent (ADR-0014, reference §17).
 */
export const DEFAULT_BINDINGS: BindingMap = {
  'key:Space': { control: 'autoTake.trigger', mode: 'trigger' },
  'serial:gpi': { control: 'autoTake.trigger', mode: 'trigger' },
  'gamepad:button/0': { control: 'autoTake.trigger', mode: 'trigger' },
  'midi:note/0/60': { control: 'autoTake.trigger', mode: 'trigger' },
  'key:KeyF': { control: 'autoFade.trigger', mode: 'trigger' },
  'key:Digit1': { control: 'busA.source', mode: 'set', value: 1 },
  'key:Digit2': { control: 'busA.source', mode: 'set', value: 2 },
  'key:Digit3': { control: 'busA.source', mode: 'set', value: 3 },
  'key:Digit4': { control: 'busA.source', mode: 'set', value: 4 },
  'key:KeyP': { control: 'programOut', mode: 'toggle' },
  'key:KeyT': { control: 'transition.type', mode: 'toggle' },
  'key:BracketLeft': { control: 'lever.position', mode: 'nudge', value: -0.05 },
  'key:BracketRight': { control: 'lever.position', mode: 'nudge', value: 0.05 },
  'gamepad:axis/1': { control: 'lever.position', mode: 'set', range: { lo: -1, hi: 1 } },
  'midi:cc/0/7': { control: 'audio.master', mode: 'set', range: { lo: 0, hi: 127 } },
};

/**
 * The published DAW profile (ADR-0018): a stable map an Ableton session template can target
 * forever. Continuous controls on low CCs (lever and fade lever in 14-bit via the CC n/n+32
 * MSB/LSB pair), sources and transport on notes around middle C, Program Change 0–7 as
 * immediate preset recall. Channel 1 (index 0) throughout.
 */
export const ABLETON_PROFILE: BindingMap = {
  // Continuous — CC values arrive 0..127 (or 0..16383 when fine).
  'midi:cc/0/1': { control: 'lever.position', mode: 'set', fine: true },
  'midi:cc/0/2': { control: 'fade.lever', mode: 'set', fine: true },
  'midi:cc/0/3': { control: 'key.slice', mode: 'set' },
  'midi:cc/0/4': { control: 'key.hue', mode: 'set' },
  'midi:cc/0/5': { control: 'positioner.x', mode: 'set', range: { lo: 0, hi: 127 } },
  'midi:cc/0/6': { control: 'positioner.y', mode: 'set', range: { lo: 0, hi: 127 } },
  'midi:cc/0/7': { control: 'audio.master', mode: 'set' },
  'midi:cc/0/8': { control: 'audio.a', mode: 'set' },
  'midi:cc/0/9': { control: 'audio.b', mode: 'set' },
  'midi:cc/0/10': { control: 'audio.aux1', mode: 'set' },
  'midi:cc/0/11': { control: 'audio.micAux2', mode: 'set' },
  'midi:cc/0/12': { control: 'ccA.chroma', mode: 'set' },
  'midi:cc/0/13': { control: 'ccB.chroma', mode: 'set' },
  'midi:cc/0/14': { control: 'positioner.size', mode: 'set' },
  // Sources + program out — notes from middle C.
  'midi:note/0/60': { control: 'busA.source', mode: 'set', value: 1 },
  'midi:note/0/61': { control: 'busA.source', mode: 'set', value: 2 },
  'midi:note/0/62': { control: 'busA.source', mode: 'set', value: 3 },
  'midi:note/0/63': { control: 'busA.source', mode: 'set', value: 4 },
  'midi:note/0/64': { control: 'busB.source', mode: 'set', value: 1 },
  'midi:note/0/65': { control: 'busB.source', mode: 'set', value: 2 },
  'midi:note/0/66': { control: 'busB.source', mode: 'set', value: 3 },
  'midi:note/0/67': { control: 'busB.source', mode: 'set', value: 4 },
  'midi:note/0/68': { control: 'programOut', mode: 'toggle' },
  'midi:note/0/69': { control: 'transition.type', mode: 'toggle' },
  // Transport + memory verbs.
  'midi:note/0/70': { control: 'autoTake.trigger', mode: 'trigger' },
  'midi:note/0/71': { control: 'autoFade.trigger', mode: 'trigger' },
  'midi:note/0/72': { control: 'memory.storeArm', mode: 'trigger' },
  // Preset recall — Program Change 0..7 → slots 1..8 (immediate, ADR-0018).
  'midi:pc/0/0': { control: 'memory.recall', mode: 'set', value: 1 },
  'midi:pc/0/1': { control: 'memory.recall', mode: 'set', value: 2 },
  'midi:pc/0/2': { control: 'memory.recall', mode: 'set', value: 3 },
  'midi:pc/0/3': { control: 'memory.recall', mode: 'set', value: 4 },
  'midi:pc/0/4': { control: 'memory.recall', mode: 'set', value: 5 },
  'midi:pc/0/5': { control: 'memory.recall', mode: 'set', value: 6 },
  'midi:pc/0/6': { control: 'memory.recall', mode: 'set', value: 7 },
  'midi:pc/0/7': { control: 'memory.recall', mode: 'set', value: 8 },
};

/** A runtime, mutable binding table backed by a BindingMap. Rebind/reset fire onChange (persist). */
export class BindingTable {
  private map: BindingMap;

  constructor(
    initial: BindingMap = DEFAULT_BINDINGS,
    private readonly onChange?: (map: BindingMap) => void,
  ) {
    this.map = { ...initial };
  }

  /** The binding at an address, or null if unbound. */
  get(address: string): Binding | null {
    return address in this.map ? this.map[address]! : null;
  }

  rebind(address: string, binding: Binding): void {
    this.map = { ...this.map, [address]: binding };
    this.onChange?.(this.map);
  }

  unbind(address: string): void {
    if (!(address in this.map)) return;
    const next: BindingMap = {};
    for (const key in this.map) if (key !== address) next[key] = this.map[key]!;
    this.map = next;
    this.onChange?.(this.map);
  }

  /** Restore the ships-with defaults. */
  reset(): void {
    this.map = { ...DEFAULT_BINDINGS };
    this.onChange?.(this.map);
  }

  /** Replace the whole table (profile switch, ADR-0018). */
  replace(map: BindingMap): void {
    this.map = { ...map };
    this.onChange?.(this.map);
  }

  toJSON(): BindingMap {
    return { ...this.map };
  }

  /** Rehydrate from a persisted map; null/absent falls back to the defaults. */
  static fromJSON(map: BindingMap | null): BindingTable {
    return new BindingTable(map ?? DEFAULT_BINDINGS);
  }
}
