// BROWSER-ONLY Web Serial GPI adapter (ADR-0014): the optional physical-contact path. A wired
// foot-switch / GPI box on a USB serial adapter fires the `serial:gpi` binding (Auto Take) on the
// pulse edge — preserving the hardware GPI's meaning (reference §17) without the BNC/DIP detail.
//
// requestPort() is GESTURE-GATED by the browser, so boot never prompts: start() attaches only the
// ALREADY-GRANTED ports (navigator.serial.getPorts()) and re-attaches on 'connect' when a granted
// device is plugged back in; requestAndAttach() is the one prompting entry and must be called
// from a click handler (the header's "GPI…" button). Web Serial types are not in the default
// lib, so this is loosely typed + capability-detected; typechecked + served, excluded from CI.

import type { BindingTable } from './bindings.js';
import type { SignalCoalescer } from './resolver.js';

interface SerialPortLike {
  open(options: { baudRate: number }): Promise<void>;
  readable: ReadableStream<Uint8Array> | null;
}

interface SerialApiLike {
  requestPort(): Promise<SerialPortLike>;
  getPorts(): Promise<SerialPortLike[]>;
  addEventListener?(type: string, listener: (event: { target: unknown }) => void): void;
}

interface SerialNavLike {
  serial?: SerialApiLike;
}

export class SerialGpiAdapter {
  private readonly attached = new Set<SerialPortLike>();
  /** Reflects attachment changes to the UI affordance (count of live GPI ports). */
  onPorts: ((count: number) => void) | null = null;

  constructor(
    private readonly table: BindingTable,
    private readonly coalescer: SignalCoalescer,
  ) {}

  private api(): SerialApiLike | null {
    const nav = (typeof navigator !== 'undefined' ? navigator : {}) as unknown as SerialNavLike;
    return nav.serial ?? null;
  }

  /**
   * Non-prompting boot path: attach every previously-granted port and re-attach granted
   * devices when they are plugged back in. Never rejects (boot must not care).
   */
  async start(): Promise<void> {
    const serial = this.api();
    if (!serial) return;
    try {
      const ports = await serial.getPorts();
      for (const port of ports) void this.attach(port);
      serial.addEventListener?.('connect', (e) => void this.attach(e.target as SerialPortLike));
    } catch {
      // Capability present but enumeration failed: the GPI path stays dormant.
    }
  }

  /**
   * GESTURE-GATED: show the port chooser and attach the choice. Call only from a click
   * handler. Resolves false when the operator cancels or the prompt is disallowed.
   */
  async requestAndAttach(): Promise<boolean> {
    const serial = this.api();
    if (!serial) return false;
    try {
      const port = await serial.requestPort();
      await this.attach(port);
      return this.attached.has(port);
    } catch {
      return false; // cancelled chooser / SecurityError / no device
    }
  }

  private async attach(port: SerialPortLike): Promise<void> {
    if (!port || this.attached.has(port)) return;
    try {
      await port.open({ baudRate: 9600 });
    } catch {
      // Already open elsewhere or the device vanished — either way, not ours to read.
      return;
    }
    const readable = port.readable;
    if (!readable) return;
    this.attached.add(port);
    this.onPorts?.(this.attached.size);
    const reader = readable.getReader();
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        if (value && value.length > 0) this.fire(); // any pulse = a GPI edge
      }
    } catch {
      // Device unplugged mid-read: fall through to release.
    } finally {
      reader.releaseLock();
      this.attached.delete(port);
      this.onPorts?.(this.attached.size);
    }
  }

  private fire(): void {
    const binding = this.table.get('serial:gpi');
    if (binding) this.coalescer.push({ control: binding.control, mode: binding.mode, value: binding.value });
  }
}
