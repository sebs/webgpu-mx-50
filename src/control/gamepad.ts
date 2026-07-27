// BROWSER-ONLY gamepad adapter (ADR-0014): polled once per render tick (gamepads are poll-only).
// Analog axes → continuous logical controls; buttons → discrete controls on the press edge.
// Typechecked + served, excluded from CI (navigator.getGamepads is undefined under node).

import type { Binding, BindingTable } from './bindings.js';
import type { SignalCoalescer } from './resolver.js';

/** Normalise a raw axis value through a binding's range + curve into 0..1. */
function mapValue(raw: number, binding: Binding): number {
  const range = binding.range;
  let v = range ? (raw - range.lo) / (range.hi - range.lo) : raw;
  v = v < 0 ? 0 : v > 1 ? 1 : v;
  return binding.curve === 'square' ? v * v : v;
}

export class GamepadAdapter {
  private readonly wasPressed: boolean[] = [];

  constructor(
    private readonly table: BindingTable,
    private readonly coalescer: SignalCoalescer,
  ) {}

  poll(): void {
    const nav = typeof navigator !== 'undefined' ? navigator : null;
    const pads = nav && nav.getGamepads ? nav.getGamepads() : [];
    for (const pad of pads) {
      if (!pad) continue;
      for (let a = 0; a < pad.axes.length; a++) {
        const binding = this.table.get(`gamepad:axis/${a}`);
        if (binding) this.coalescer.push({ control: binding.control, mode: binding.mode, value: mapValue(pad.axes[a]!, binding) });
      }
      for (let b = 0; b < pad.buttons.length; b++) {
        const pressed = pad.buttons[b]!.pressed;
        if (pressed && !this.wasPressed[b]) {
          const binding = this.table.get(`gamepad:button/${b}`);
          if (binding) this.coalescer.push({ control: binding.control, mode: binding.mode, value: binding.value });
        }
        this.wasPressed[b] = pressed;
      }
    }
  }
}
