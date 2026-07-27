// Control-input mapping layer barrel (ADR-0014). PURE core (logical controls, bindings, resolver,
// keyboard core, automation) is CI-tested; the DOM/gamepad/MIDI/serial adapters are browser-only
// (typecheck + serve). main.ts wires the coalescer's flush into the render loop as the single
// place resolveSignal fires.

export * from './logical-control.js';
export * from './bindings.js';
export * from './resolver.js';
export * from './keyboard.js';
export * from './automation.js';
export { GamepadAdapter } from './gamepad.js';
export { MidiAdapter } from './midi.js';
export { SerialGpiAdapter } from './serial.js';
