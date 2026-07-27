// Special Modes (reference §14): the eight factory-preset effect macros of the Special Mode
// bank, entered with MEMORY+SHIFT and armed via the Event buttons. Pure domain — the macro
// table, selection mapping, lever-at-B preconditions, and frame counts. The compressed-image
// VISUALS (Stream/Cork Screw/Bounce/Flip/Shutter/Vibrate/Satellite geometry) are GPU work
// deferred like the other complex passes; this module models the state machine the specs test.
//
// banira lib floor: for-loops + index arithmetic only (no Array.includes / ** ).

/** The eight macros in Event-button order (1..4, then SHIFT+1..4 → 5..8). */
export type SpecialMacro =
  | 'mosaic-mix'
  | 'stream'
  | 'cork-screw'
  | 'bounce'
  | 'flip'
  | 'shutter'
  | 'vibrate'
  | 'satellite';

export interface SpecialMacroSpec {
  ordinal: number; // 1..8
  id: SpecialMacro;
  name: string; // display name as it appears in the reference / feature
  needsLeverAtB: boolean; // Shutter/Vibrate/Satellite require the lever fully at B before starting
  frameCount: number | null; // finite frame-counted run (Vibrate), else null
  character: string; // the transition's described character (empty where it is a pixel-only result)
}

/** Vibrate's shake lasts exactly 64 video frames on the canonical clock (reference §14, ADR-0012). */
export const VIBRATE_FRAMES = 64;

export const SPECIAL_MACROS: readonly SpecialMacroSpec[] = [
  { ordinal: 1, id: 'mosaic-mix', name: 'Mosaic Mix', needsLeverAtB: false, frameCount: null, character: 'the mix itself becomes mosaic-pixelated mid-transition' },
  { ordinal: 2, id: 'stream', name: 'Stream', needsLeverAtB: false, frameCount: null, character: 'a compressed image zooms in from a corner' },
  { ordinal: 3, id: 'cork-screw', name: 'Cork Screw', needsLeverAtB: false, frameCount: null, character: 'a compressed image corkscrews in from a corner' },
  { ordinal: 4, id: 'bounce', name: 'Bounce', needsLeverAtB: false, frameCount: null, character: 'a compressed image drops in and bounces' },
  { ordinal: 5, id: 'flip', name: 'Flip', needsLeverAtB: false, frameCount: null, character: 'a vertical split compressed wipe reveals over the Matte colour' },
  { ordinal: 6, id: 'shutter', name: 'Shutter', needsLeverAtB: true, frameCount: null, character: '' },
  { ordinal: 7, id: 'vibrate', name: 'Vibrate', needsLeverAtB: true, frameCount: VIBRATE_FRAMES, character: '' },
  { ordinal: 8, id: 'satellite', name: 'Satellite', needsLeverAtB: true, frameCount: null, character: '' },
];

/** The macro an Event button (1..4) selects, +4 when SHIFT is held (reference §14). */
export function macroFromButton(button: number, shift: boolean): SpecialMacro {
  return SPECIAL_MACROS[button - 1 + (shift ? 4 : 0)]!.id;
}

export function macroSpec(id: SpecialMacro): SpecialMacroSpec {
  for (let i = 0; i < SPECIAL_MACROS.length; i++) if (SPECIAL_MACROS[i]!.id === id) return SPECIAL_MACROS[i]!;
  throw new Error(`unknown macro ${id}`);
}

export function macroName(id: SpecialMacro): string {
  return macroSpec(id).name;
}

export function macroByName(name: string): SpecialMacro {
  for (let i = 0; i < SPECIAL_MACROS.length; i++) if (SPECIAL_MACROS[i]!.name === name) return SPECIAL_MACROS[i]!.id;
  throw new Error(`unknown macro ${name}`);
}

export function macroCharacter(id: SpecialMacro): string {
  return macroSpec(id).character;
}

/** Whether the macro needs the Mix/Wipe lever fully at B before it can start (reference §14). */
export function macroNeedsLeverAtB(id: SpecialMacro): boolean {
  return macroSpec(id).needsLeverAtB;
}

/** Whether the macro may run right now: always, unless it needs the lever at B and it is not. */
export function canRunMacro(id: SpecialMacro, lever: number): boolean {
  return !macroNeedsLeverAtB(id) || lever >= 1;
}

/** Shutter is a horizontal split, or a Circle-Wipe variant when the Square Wipe is active (reference §14). */
export function shutterRevealShape(squareWipeActive: boolean): 'horizontal-split' | 'circle-wipe' {
  return squareWipeActive ? 'circle-wipe' : 'horizontal-split';
}

/** The MEMORY LED blinks to indicate Special Mode is active (reference §14). */
export function memoryLedBlinking(active: boolean): boolean {
  return active;
}
