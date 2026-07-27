// BROWSER-ONLY Web MIDI adapter (ADR-0014): the richest surface, the modern stand-in for a
// hardware panel. Note On/Off → discrete controls; Control Change → continuous controls. Web MIDI
// types are not in the default lib, so this is loosely typed and capability-detected; typechecked
// + served, excluded from CI (navigator.requestMIDIAccess is undefined under node and needs a gesture).

import type { Binding, BindingTable } from './bindings.js';
import type { SignalCoalescer } from './resolver.js';

interface MidiLike {
  requestMIDIAccess?: () => Promise<{ inputs: Map<string, { onmidimessage: ((e: { data: Uint8Array }) => void) | null }> }>;
}

function ccValue(raw7bit: number, binding: Binding): number {
  const v = binding.range ? (raw7bit - binding.range.lo) / (binding.range.hi - binding.range.lo) : raw7bit / 127;
  const clamped = v < 0 ? 0 : v > 1 ? 1 : v;
  return binding.curve === 'square' ? clamped * clamped : clamped;
}

export class MidiAdapter {
  constructor(
    private readonly table: BindingTable,
    private readonly coalescer: SignalCoalescer,
  ) {}

  async start(): Promise<void> {
    const nav = (typeof navigator !== 'undefined' ? navigator : {}) as unknown as MidiLike;
    if (!nav.requestMIDIAccess) return;
    const access = await nav.requestMIDIAccess();
    for (const input of access.inputs.values()) {
      input.onmidimessage = (e) => this.onMessage(e.data);
    }
  }

  private onMessage(data: Uint8Array): void {
    const status = data[0]! & 0xf0;
    const channel = data[0]! & 0x0f;
    if (status === 0x90 && data[2]! > 0) {
      // Note On → discrete control.
      const binding = this.table.get(`midi:note/${channel}/${data[1]!}`);
      if (binding) this.coalescer.push({ control: binding.control, mode: binding.mode, value: binding.value });
    } else if (status === 0xb0) {
      // Control Change → continuous control.
      const binding = this.table.get(`midi:cc/${channel}/${data[1]!}`);
      if (binding) this.coalescer.push({ control: binding.control, mode: binding.mode, value: ccValue(data[2]!, binding) });
    }
  }
}
