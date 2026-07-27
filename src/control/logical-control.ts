// The logical-control model (ADR-0014): the remappable vocabulary that every input surface —
// pointer, keyboard, gamepad, MIDI, Web Serial, automation — normalises onto. A ControlSignal
// addresses one logical control with a mode; the resolver (resolver.ts) is the only thing that
// turns a signal into a store Command. Adding a remappable control is one union member + one
// resolver case, no consumer changes.

/** A remappable logical control. Extend here + add a resolver case to expose a new one. */
export type LogicalControlId =
  | 'lever.position'
  | 'transition.type'
  | 'transitionTime'
  | 'autoTake.trigger'
  | 'autoFade.trigger'
  | 'busA.source'
  | 'busB.source'
  | 'programOut'
  | 'fade.lever'
  | 'key.slice'
  | 'key.hue'
  | 'positioner.x'
  | 'positioner.y'
  | 'positioner.size'
  | 'ccA.chroma'
  | 'ccB.chroma'
  | 'audio.a'
  | 'audio.b'
  | 'audio.aux1'
  | 'audio.micAux2'
  | 'audio.master';

/**
 * How a signal acts on its control:
 * - `set`     — absolute value (a fader/lever position, a source number).
 * - `nudge`   — relative step added to the current value (a rotary encoder / arrow key).
 * - `toggle`  — advance a discrete control to its next state (program out, transition type).
 * - `trigger` — a momentary pulse (Auto Take / Auto Fade); value is ignored.
 */
export type ControlMode = 'set' | 'nudge' | 'toggle' | 'trigger';

/** One normalised input event addressed to a logical control. */
export interface ControlSignal {
  readonly control: LogicalControlId;
  readonly mode: ControlMode;
  readonly value?: number;
}
