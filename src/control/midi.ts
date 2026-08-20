// BROWSER-ONLY Web MIDI adapter (ADR-0014/0018): the richest surface, the modern stand-in
// for a hardware panel — and the DAW's door into the mixer. Note On/Off → discrete controls;
// Control Change → continuous (with 14-bit MSB/LSB pairing and relative-encoder support);
// Program Change → preset verbs; an optional MPE lower zone turns each held note into a
// three-axis gesture voice (bend/slide/pressure per finger). A one-shot learn capture feeds
// the MIDI-learn UI. Web MIDI types are not in the default lib, so port access is loosely
// typed and capability-detected; `handle()` and the classifier are pure of the port layer
// and unit-tested (navigator.requestMIDIAccess is undefined under node and needs a gesture).
//
// banira lib floor: index/`in`/`===` only — no Array.includes, no `**`.

import type { Binding, BindingTable } from './bindings.js';
import type { SignalCoalescer } from './resolver.js';

interface MidiLike {
  requestMIDIAccess?: () => Promise<{ inputs: Map<string, { onmidimessage: ((e: { data: Uint8Array }) => void) | null }> }>;
}

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);

/** Normalise a 7-bit CC value through the binding's range, 0..1. */
function ccValue01(raw7bit: number, binding: Binding): number {
  return clamp01(binding.range ? (raw7bit - binding.range.lo) / (binding.range.hi - binding.range.lo) : raw7bit / 127);
}

/** The binding's response curve ('square' uses v*v — never the ** operator). */
function applyCurve(v01: number, binding: Binding): number {
  return binding.curve === 'square' ? v01 * v01 : v01;
}

// --- MIDI learn (ADR-0018) --------------------------------------------------------------

/** One classifiable message observed during a learn window. */
export interface CapturedEvent {
  kind: 'note' | 'cc' | 'pc';
  channel: number;
  number: number;
  value: number;
}

/** What a learn capture concluded about the touched input. */
export interface LearnedInput {
  /** Binding address of the base input (fine pairs report the MSB address). */
  address: string;
  kind: 'note' | 'cc' | 'pc';
  channel: number;
  number: number;
  /** An n / n+32 CC pair was observed — a 14-bit source. */
  fine: boolean;
  /** CC values hovered the centre detent — a relative encoder (bind as `nudge`). */
  relative: boolean;
}

/**
 * Classify a learn window (ADR-0018 heuristics). Pure: first event picks the input; a CC
 * seen together with its n+32 partner is 14-bit; three or more CC values all inside 62..66
 * is the signature of a relative "binary offset" encoder at rest speed.
 */
export function classifyCapture(events: readonly CapturedEvent[]): LearnedInput | null {
  const first = events[0];
  if (!first) return null;
  if (first.kind === 'note' || first.kind === 'pc') {
    return {
      address: `midi:${first.kind === 'note' ? 'note' : 'pc'}/${first.channel}/${first.number}`,
      kind: first.kind, channel: first.channel, number: first.number, fine: false, relative: false,
    };
  }
  // CC: gather the numbers seen on the first event's channel.
  const seen: number[] = [];
  let ccCount = 0;
  let centred = 0;
  for (const e of events) {
    if (e.kind !== 'cc' || e.channel !== first.channel) continue;
    if (seen.indexOf(e.number) === -1) seen.push(e.number);
    ccCount++;
    if (e.value >= 62 && e.value <= 66) centred++;
  }
  let base = first.number >= 32 && first.number < 64 ? first.number - 32 : first.number;
  let fine = false;
  for (const n of seen) {
    const partner = n < 32 ? n + 32 : n - 32;
    if (seen.indexOf(partner) !== -1) {
      base = n < 32 ? n : partner;
      fine = true;
      break;
    }
  }
  if (!fine) base = first.number;
  const relative = !fine && ccCount >= 3 && centred === ccCount;
  return {
    address: `midi:cc/${first.channel}/${base}`,
    kind: 'cc', channel: first.channel, number: base, fine, relative,
  };
}

/** How long a learn capture keeps listening after the first message (pairing/encoder evidence). */
const LEARN_WINDOW_MS = 300;

// --- The adapter -------------------------------------------------------------------------

export class MidiAdapter {
  /** 14-bit pairing state, keyed "channel/baseCc". */
  private readonly msb = new Map<string, number>();
  private readonly lsb = new Map<string, number>();
  /** MPE voice map: member channel → held note (one note per channel by MPE design). */
  private readonly mpeNotes = new Map<number, number>();
  private mpeOn = false;
  private learnPending: { cb: (learned: LearnedInput) => void; events: CapturedEvent[]; timer: ReturnType<typeof setTimeout> | null } | null = null;

  constructor(
    private readonly table: BindingTable,
    private readonly coalescer: SignalCoalescer,
  ) {}

  async start(): Promise<void> {
    const nav = (typeof navigator !== 'undefined' ? navigator : {}) as unknown as MidiLike;
    if (!nav.requestMIDIAccess) return;
    const access = await nav.requestMIDIAccess();
    for (const input of access.inputs.values()) {
      input.onmidimessage = (e) => this.handle(e.data);
    }
  }

  /** MPE lower zone on/off (master channel 1; members 2–16). Toggling clears held voices. */
  setMpe(on: boolean): void {
    this.mpeOn = on;
    this.mpeNotes.clear();
  }

  get mpeEnabled(): boolean {
    return this.mpeOn;
  }

  /** Arm a one-shot learn capture: the next touched input (plus a short evidence window
   *  for 14-bit pairs and relative encoders) is classified and reported; nothing reaches
   *  the coalescer while the capture runs. */
  learn(cb: (learned: LearnedInput) => void): void {
    this.cancelLearn();
    this.learnPending = { cb, events: [], timer: null };
  }

  cancelLearn(): void {
    if (this.learnPending?.timer != null) clearTimeout(this.learnPending.timer);
    this.learnPending = null;
  }

  get learning(): boolean {
    return this.learnPending !== null;
  }

  /** One raw MIDI message. Public and port-free, so tests drive it directly. */
  handle(data: Uint8Array): void {
    const status = data[0]! & 0xf0;
    const channel = data[0]! & 0x0f;

    if (this.learnPending) {
      this.captureForLearn(status, channel, data);
      return;
    }
    // MPE member channels are gesture voices; consumed messages never double-fire
    // plain note/cc bindings. The master channel (and MPE off) takes the plain path.
    if (this.mpeOn && channel !== 0 && this.handleMpe(status, channel, data)) return;

    if (status === 0x90 && data[2]! > 0) {
      this.pushDiscrete(`midi:note/${channel}/${data[1]!}`, data[2]! / 127);
    } else if (status === 0xb0) {
      this.onCc(channel, data[1]!, data[2]!);
    } else if (status === 0xc0) {
      // Program Change → preset verbs (ADR-0018); the binding carries the slot value.
      this.pushDiscrete(`midi:pc/${channel}/${data[1]!}`, 0);
    }
  }

  // --- plain path ---

  private onCc(channel: number, cc: number, raw: number): void {
    // LSB half of a 14-bit pair? (CC 32–63 pairs with base CC n-32 when that binding opts in.)
    if (cc >= 32 && cc < 64) {
      const base = cc - 32;
      const baseBinding = this.table.get(`midi:cc/${channel}/${base}`);
      if (baseBinding && baseBinding.fine) {
        const key = `${channel}/${base}`;
        this.lsb.set(key, raw);
        const msb = this.msb.get(key);
        if (msb !== undefined) this.emit(baseBinding, ((msb << 7) | raw) / 16383);
        return;
      }
    }
    const binding = this.table.get(`midi:cc/${channel}/${cc}`);
    if (!binding) return;
    if (binding.fine && cc < 32) {
      // MSB half: emit immediately with the last LSB (0 until one arrives) for latency-free
      // coarse movement; the following LSB refines the same tick via the coalescer.
      const key = `${channel}/${cc}`;
      this.msb.set(key, raw);
      this.emit(binding, ((raw << 7) | (this.lsb.get(key) ?? 0)) / 16383);
      return;
    }
    if (binding.relative) {
      // Binary-offset encoder: 1..63 = +delta, 65..127 = −delta (two's complement style).
      const delta = raw < 64 ? raw : raw - 128;
      this.coalescer.push({ control: binding.control, mode: 'nudge', value: delta / 127 });
      return;
    }
    this.emit(binding, ccValue01(raw, binding));
  }

  private emit(binding: Binding, v01: number): void {
    this.coalescer.push({ control: binding.control, mode: binding.mode, value: applyCurve(v01, binding) });
  }

  private pushDiscrete(address: string, fallback01: number): void {
    const binding = this.table.get(address);
    if (binding) this.coalescer.push({ control: binding.control, mode: binding.mode, value: binding.value ?? fallback01 });
  }

  // --- MPE (ADR-0018 outlook, lower zone) ---

  private handleMpe(status: number, channel: number, data: Uint8Array): boolean {
    if (status === 0x90 && data[2]! > 0) {
      this.mpeNotes.set(channel, data[1]!);
      this.pushDiscrete(`mpe:pad/${data[1]!}/on`, data[2]! / 127);
      return true;
    }
    if (status === 0x80 || (status === 0x90 && data[2]! === 0)) {
      const note = this.mpeNotes.get(channel);
      if (note === data[1]!) {
        this.mpeNotes.delete(channel);
        this.pushDiscrete(`mpe:pad/${note}/release`, data[2]! / 127);
      }
      return true;
    }
    const note = this.mpeNotes.get(channel);
    if (status === 0xe0) {
      if (note !== undefined) this.pushMpeAxis(`mpe:pad/${note}/bend`, ((data[2]! << 7) | data[1]!) / 16383);
      return true;
    }
    if (status === 0xd0) {
      if (note !== undefined) this.pushMpeAxis(`mpe:pad/${note}/pressure`, data[1]! / 127);
      return true;
    }
    if (status === 0xb0 && data[1]! === 74) {
      if (note !== undefined) this.pushMpeAxis(`mpe:pad/${note}/slide`, data[2]! / 127);
      return true;
    }
    return false; // other member-channel traffic falls through to the plain path
  }

  private pushMpeAxis(address: string, v01: number): void {
    const binding = this.table.get(address);
    if (binding) this.emit(binding, clamp01(v01));
  }

  // --- learn capture ---

  private captureForLearn(status: number, channel: number, data: Uint8Array): void {
    const pending = this.learnPending!;
    let event: CapturedEvent | null = null;
    if (status === 0x90 && data[2]! > 0) event = { kind: 'note', channel, number: data[1]!, value: data[2]! };
    else if (status === 0xb0) event = { kind: 'cc', channel, number: data[1]!, value: data[2]! };
    else if (status === 0xc0) event = { kind: 'pc', channel, number: data[1]!, value: 0 };
    if (!event) return; // bend/pressure/note-off carry no learnable base address
    pending.events.push(event);
    if (pending.timer === null) {
      pending.timer = setTimeout(() => {
        const learned = classifyCapture(pending.events);
        this.learnPending = null;
        if (learned) pending.cb(learned);
      }, LEARN_WINDOW_MS);
    }
  }
}
