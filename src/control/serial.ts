// BROWSER-ONLY Web Serial GPI adapter (ADR-0014): the optional physical-contact path. A wired
// foot-switch / GPI box on a USB serial adapter fires the `serial:gpi` binding (Auto Take) on the
// pulse edge — preserving the hardware GPI's meaning (reference §17) without the BNC/DIP detail.
// Web Serial types are not in the default lib, so this is loosely typed + capability-detected;
// typechecked + served, excluded from CI (navigator.serial is undefined under node, needs a gesture).

import type { BindingTable } from './bindings.js';
import type { SignalCoalescer } from './resolver.js';

interface SerialLike {
  serial?: { requestPort: () => Promise<{ open: (o: { baudRate: number }) => Promise<void>; readable: ReadableStream<Uint8Array> | null }> };
}

export class SerialGpiAdapter {
  constructor(
    private readonly table: BindingTable,
    private readonly coalescer: SignalCoalescer,
  ) {}

  async start(): Promise<void> {
    const nav = (typeof navigator !== 'undefined' ? navigator : {}) as unknown as SerialLike;
    if (!nav.serial) return;
    const port = await nav.serial.requestPort();
    await port.open({ baudRate: 9600 });
    const readable = port.readable;
    if (!readable) return;
    const reader = readable.getReader();
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      if (value && value.length > 0) this.fire(); // any pulse = a GPI edge
    }
  }

  private fire(): void {
    const binding = this.table.get('serial:gpi');
    if (binding) this.coalescer.push({ control: binding.control, mode: binding.mode, value: binding.value });
  }
}
