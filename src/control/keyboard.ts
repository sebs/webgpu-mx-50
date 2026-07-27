// Keyboard input (ADR-0014). The PURE core (keyChord / chordToSignal / isTyping) turns a key
// event's shape into a binding-table address and then a ControlSignal — fully testable without a
// DOM. The browser-only KeyboardAdapter is the thin DOM listener that feeds the coalescer,
// respecting focus so shortcuts never fire while the user is typing into a field.
//
// banira lib floor: string building + `===` only.

import type { BindingTable } from './bindings.js';
import type { ControlSignal } from './logical-control.js';
import type { SignalCoalescer } from './resolver.js';

/** A minimal key-event shape (a structural subset of KeyboardEvent) so the core stays DOM-free. */
export interface KeyLike {
  readonly code: string;
  readonly ctrlKey: boolean;
  readonly altKey: boolean;
  readonly shiftKey: boolean;
  readonly metaKey: boolean;
}

/** The binding address for a key event: "key:" + modifiers (Ctrl,Alt,Shift,Meta order) + code. */
export function keyChord(e: KeyLike): string {
  let mods = '';
  if (e.ctrlKey) mods += 'Ctrl+';
  if (e.altKey) mods += 'Alt+';
  if (e.shiftKey) mods += 'Shift+';
  if (e.metaKey) mods += 'Meta+';
  return `key:${mods}${e.code}`;
}

/** The signal a chord produces via the table, or null if the chord is unbound. */
export function chordToSignal(chord: string, table: BindingTable): ControlSignal | null {
  const binding = table.get(chord);
  if (!binding) return null;
  return { control: binding.control, mode: binding.mode, value: binding.value };
}

/** Whether focus is in a text-entry element, so keyboard shortcuts should be suppressed. */
export function isTyping(el: { tagName?: string; isContentEditable?: boolean } | null): boolean {
  if (!el) return false;
  if (el.isContentEditable) return true;
  const tag = el.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
}

/** BROWSER-ONLY (typecheck + serve, not CI): the DOM keydown listener that feeds the coalescer. */
export class KeyboardAdapter {
  constructor(
    private readonly table: BindingTable,
    private readonly coalescer: SignalCoalescer,
  ) {}

  /** Attach a global keydown listener; returns a detach function. */
  attach(target: Window): () => void {
    const onKeyDown = (e: KeyboardEvent): void => {
      if (isTyping(target.document.activeElement)) return;
      const signal = chordToSignal(keyChord(e), this.table);
      if (signal) {
        e.preventDefault();
        this.coalescer.push(signal);
      }
    };
    target.addEventListener('keydown', onKeyDown);
    return () => target.removeEventListener('keydown', onKeyDown);
  }
}
