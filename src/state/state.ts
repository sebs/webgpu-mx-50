// The whole panel as one plain, JSON-serializable value (ADR-0011). No class
// instances, no functions, no GPU / HTMLVideoElement / AudioNode handles — device
// bindings are referenced by id and resolved outside the store (ADR-0008). This is
// what makes Event Memory (8 slots) and preset import/export thin operations.
//
// Phase 1 models the front of the panel: two buses (source + Matte substitute),
// the Matte generator, the Mix/Wipe transition, and Program Out selection. Later
// phases extend this tree (colour correction, digital effects, DSK, fade, audio).

import type { BusId, BusSource, SourceSlot } from '../core/types.js';
import type { SpecialMacro } from '../core/special-mode.js';

/** Rear Reset switch: ON = factory preset each power-up, OFF = field preset (reference §18). */
export type ResetMode = 'on' | 'off';

/** Per-bus colour correction tri-state (reference §6): off → CHROMA only → +RGB joystick. */
export type ColourCorrectMode = 'off' | 'chroma-only' | 'chroma-plus-joystick';

export interface ColourCorrectState {
  mode: ColourCorrectMode;
  /** CHROMA/saturation, 0..1; 0.5 = centre (original), 0 = MIN (black & white). */
  chroma: number;
  /** RGB tint joystick, each axis -1..1; (0,0) = centre (original balance). */
  joystickX: number;
  joystickY: number;
}

/**
 * A bus's current selection plus its Matte substitute (ADR-0006) and its colour
 * correction (reference §6, applied before the Digital Effect stage).
 */
export interface BusState {
  source: BusSource;
  substituteSource: SourceSlot;
  colourCorrect: ColourCorrectState;
}

/**
 * The audio mixer (reference §5). Every fader is 0..1 travel (0 = off, 0.5 = 0 dB /
 * unity, 1 = full boost — see core/audio.ts). Program-Out routing (which faders reach
 * the mix, and whether Master governs) is derived by programAudio()/programAudioMix(),
 * never stored here.
 */
export interface AudioFaders {
  a: number;
  b: number;
  aux1: number;
  micAux2: number;
  master: number;
}

/** The front-panel MIC/AUX2 switch: one shared fader feeds either Mic or Aux 2 (reference §2, §5). */
export type MicAux2Input = 'mic' | 'aux2';

/**
 * The audio block (reference §5, §12). Holds the standing fader positions, the MIC/AUX2
 * switch, and the AUDIO FOLLOW toggle. When AUDIO FOLLOW is engaged the A/B bus gains are
 * driven by the Mix/Wipe lever at read time (effectiveBusGains) — the stored faders are
 * never mutated, so disengaging restores them for free.
 */
export interface AudioState {
  faders: AudioFaders;
  micAux2: MicAux2Input;
  audioFollow: boolean;
}

/** The filter-family digital effects (reference §8.1–§8.4). */
export type FilterEffect = 'nega' | 'mosaic' | 'mono' | 'paint';

/** An effect A/V Synchro can pulse in time with the audio (reference §8.9). */
export type AvSynchroEffect = FilterEffect | 'still' | 'strobe';

/** Which effects A/V Synchro drives when armed (reference §8.9). */
export interface AvSynchroEffects {
  nega: boolean;
  mosaic: boolean;
  mono: boolean;
  paint: boolean;
  still: boolean;
  strobe: boolean;
}

/** The freeze-family digital effects backed by GPU frame memory (reference §8.5–§8.8, ADR-0007). */
export type FreezeEffect = 'still' | 'strobe' | 'multi' | 'trail';

/**
 * The Frame button field/frame mode (reference §8.10). A documented v1 NO-OP (ADR-0005 §6):
 * clean-modern video is full-resolution progressive RGBA with no interlace fields, so there is
 * no field/frame resolution trade — the button never changes the effect output. See
 * FRAME_MODE_AFFECTS_OUTPUT in core/digital-effect.ts.
 */
export type FrameMode = 'field' | 'frame';

/** Any digital effect the block can arm. */
export type DigitalEffectName = FilterEffect | FreezeEffect;

/** The freeze-family state (reference §8.5–§8.8). `multi` is 0 (off) or a grid count 4/9/16. */
export interface FreezeState {
  still: boolean;
  strobe: boolean;
  multi: number; // 0 | 4 | 9 | 16
  trail: boolean;
}

/**
 * The Digital Effect block (reference §8). It targets exactly one bus at a time; `armed`
 * is the chosen-but-not-yet-ON effect. Covers the four filters and the freeze family.
 */
export interface DigitalEffectState {
  bus: BusId;
  armed: DigitalEffectName | null;
  active: { nega: boolean; mosaic: boolean; mono: boolean; paint: boolean };
  freeze: FreezeState;
  mosaicSize: number; // 1..31 (reference §8.2)
  paintLevel: number; // 0..1, MIN..MAX (reference §8.4)
  strobeTime: number; // TIME control position 0..1 (reference §8.6)
  multiTime: number; // 0..1 (reference §8.7)
  trailTime: number; // 0..1 (reference §8.8)
  multiMode: 'once' | 'repeat'; // reference §8.7
  trailCorner: 'upper-left' | 'upper-right'; // reference §8.8
  /** Field/frame button (reference §8.10). Inert in v1 (ADR-0005 §6); see FRAME_MODE_AFFECTS_OUTPUT. */
  frameMode: FrameMode;
  /** A/V Synchro armed; also gates the Trail exclusion (§8.8). */
  avSynchro: boolean;
  /**
   * A/V Synchro LEVEL threshold, 0..1 (reference §8.9). Toward MAX = loud-only (high
   * threshold), toward MIN = quiet also triggers (low threshold). See core/av-synchro.ts.
   */
  avSynchroLevel: number;
  /** Which effects A/V Synchro pulses when armed (reference §8.9). */
  avSynchroEffects: AvSynchroEffects;
}

/** The internal Matte generator (reference §4). `colorIndex` steps the 9 colours. */
export interface MatteState {
  colorIndex: number;
  level: number; // 0..1
  gradation: boolean;
}

/** The Mix/Wipe block selection (reference §9). */
export type TransitionType = 'mix' | 'nam' | 'wipe' | 'lum-key' | 'chroma-key';

/** The 7 wipe pattern families (reference §9.4, ADR-0009). */
export type WipeFamily = 'straight' | 'corner' | 'diagonal' | 'triangle' | 'split' | 'mosaic' | 'square';

/** Boundary treatment: a hard edge, a coloured Border (narrow/wide), or a Soft feather. */
export type WipeEdge = 'hard' | 'border-narrow' | 'border-wide' | 'soft-narrow' | 'soft-wide';

/** The stackable Modify functions (reference §9.4). Each 0/false = off. */
export interface WipeModifiers {
  compression: 0 | 1 | 2; // 1 = incoming compressed, 2 = both
  slide: 0 | 1 | 2; // 1 = incoming slides, 2 = both
  multi: number; // 0 = off, 1..6 multi modes
  pairing: boolean;
  blinds: boolean;
}

/** The composed wipe (reference §9.4, ADR-0009). */
export interface WipeState {
  family: WipeFamily;
  variant: number; // 0..3
  modifiers: WipeModifiers;
  edge: WipeEdge;
  reverse: boolean;
  oneWay: boolean;
  aspect: number; // -1..1, 0 = centre; Square family only
  aspectOn: boolean; // ASPECT ON button — aspect applies only when lit (reference §7, §9.4)
}

/**
 * The Positioner and Scene Grabber (reference §7). Works only with Square-family wipes:
 * the ON button doubles the wiped size, the lever sizes the inset, the joystick places it,
 * and Scene Grabber freezes the image inside the inset so the joystick moves the still.
 */
export interface PositionerState {
  on: boolean;
  x: number; // joystick, -1..1
  y: number;
  size: number; // wiped/inset size 0..1
  sceneGrabber: boolean;
}

/** Automatic-transition runner lifecycle (ADR-0012): idle → running → (paused ⇄ running) → complete. */
export type RunnerPhase = 'idle' | 'running' | 'paused' | 'complete';

/**
 * The single transition-runner abstraction (ADR-0012), shared by Auto Take and Auto Fade.
 * Plain JSON — no handles (ADR-0011). All ticks are absolute LogicalClock ticks; the math
 * lives in core/timeline.ts. `progress` is cached (0..1) so the snapshot is self-describing.
 * A duration of 0 completes on the next advance (an instant snap). Pause accumulates
 * `pausedTicks` so `elapsed = tick - startTick - pausedTicks` freezes and resumes drift-free.
 */
export interface TransitionRunner {
  phase: RunnerPhase;
  durationTicks: number; // frozen at press (== transitionFrames; 1 frame = 1 tick)
  startTick: number;
  lastTick: number;
  pausedTicks: number;
  from: number; // lever/fade position at start, 0..1
  to: number; // target position, 0..1
  progress: number; // 0..1
}

/** A runner at rest: no take/fade in flight. */
export const IDLE_RUNNER: TransitionRunner = {
  phase: 'idle',
  durationTicks: 0,
  startTick: 0,
  lastTick: 0,
  pausedTicks: 0,
  from: 0,
  to: 0,
  progress: 0,
};

export interface TransitionState {
  type: TransitionType;
  /** Mix/Wipe lever position, 0 = fully A-bus, 1 = fully B-bus. */
  lever: number;
  /** SLICE knob, 0..1 (0.5 = centre). Lum Key = luminance threshold; Chroma Key = tolerance (§9.5/§9.6). */
  slice: number;
  /** HUE knob, 0..1 around the colour wheel — the B-bus colour removed by Chroma Key (§9.6). */
  hue: number;
  wipe: WipeState;
  /** Auto Take runner (reference §15) — when running it drives `lever` each frame (ADR-0012). */
  auto: TransitionRunner;
}

/** Downstream Key edge styles (reference §10): the EDGE button cycles this ring. */
export type DskEdgeStyle =
  | 'normal'
  | 'narrow-border'
  | 'wide-border'
  | 'narrow-shadow'
  | 'wide-shadow'
  | 'drop-shadow';

/** DSK fill for the keyed characters (reference §10). */
export type DskFill = 'matte' | 'white';

/** DSK key source: the dedicated External Camera, or the A/B bus (reference §10). */
export type DskKeySource = 'ext-camera' | 'A' | 'B';

/**
 * The Downstream Key (reference §10). It sits after Mix/Wipe and before Fade, keying a
 * title/character source over the finished composite so titles stay sharp over any effect.
 */
export interface DskState {
  on: boolean;
  fill: DskFill;
  keySource: DskKeySource;
  low: number; // Low Level Key slider, 0..1
  high: number; // High Level Key slider, 0..1
  edge: DskEdgeStyle;
  edgeColorIndex: number; // edge colour (white fill only); matte fill forces black
  reverse: boolean;
}

/** What the video fades TO at the Fade stage (reference §11). */
export type FadeTarget = 'matte' | 'white' | 'black' | 'A' | 'B';

/** The three independent Fade enables (reference §11, buttons VIDEO 80 / DSK 82 / AUDIO 84). */
export type FadeElement = 'video' | 'dsk' | 'audio';

/**
 * The Fade block (reference §11) — the LAST signal-graph stage, after the Downstream Key
 * (ADR-0004). Whichever of Video/DSK/Audio are enabled fade together from one lever move
 * toward the chosen target. `lever` (IN=0 → OUT=1) is written by `auto` during an Auto Fade.
 */
export interface FadeState {
  video: boolean; // VIDEO enable — distinct from dsk.on (the key itself)
  dsk: boolean; // DSK enable
  audio: boolean; // AUDIO enable
  target: FadeTarget;
  /** Manual Fade lever: 0 = IN (no fade), 1 = OUT (fully faded). */
  lever: number;
  /** Auto Fade runner (reference §11) — when running it drives `lever` toward OUT (ADR-0012). */
  auto: TransitionRunner;
}

/** What leaves the unit (reference §2): A/B direct-out, or the full EFFECT composite. */
export type ProgramOut = 'A' | 'B' | 'effect';

/** Housekeeping switches (reference §18). */
export interface SystemState {
  reset: ResetMode;
}

/**
 * A stored Event Memory slot / persistable panel snapshot (reference §13, ADR-0015): the whole
 * panel MINUS the memory bank and Special Mode. Omitting those two keys makes recursion
 * impossible by construction — a slot cannot transitively contain slots — and matches ADR-0015's
 * "a slot is a frozen projection of the store". Volatile runtime (GPU frame memory, transition
 * progress) is excluded too; `panelSnapshot()` idles the runners.
 */
export type PanelSnapshot = Omit<PanelState, 'memory' | 'specialMode'>;

/**
 * Event Memory (reference §13): the persistent 8-slot bank plus the transient interaction latches.
 * The bank lives in-store so STORE/RECALL are pure reducer cases and recall flows through the
 * normal notify path (ADR-0011); the persistence module mirrors `slots` to storage.
 */
export interface MemoryState {
  slots: (PanelSnapshot | null)[]; // length 8; index 0 = slot 1; null = empty
  memoryArmed: boolean; // MEMORY latched: the next EVENT NO. STORES instead of arming a recall
  armedSlot: number | null; // slot (1..8) armed for recall by the next AUTO TAKE; doubles as the sequence cursor
  lastStoredSlot: number | null; // most recently written — drives the 3-blink confirm LED (UI cue)
}

/** Store blinks the event LED this many times to confirm a successful store (reference §13). */
export const EVENT_LED_STORE_BLINKS = 3;

export const EMPTY_MEMORY: MemoryState = {
  slots: [null, null, null, null, null, null, null, null],
  memoryArmed: false,
  armedSlot: null,
  lastStoredSlot: null,
};

/** A fresh memory bank with its own arrays (never share EMPTY_MEMORY's mutable slots array). */
export function freshMemory(): MemoryState {
  return { slots: [null, null, null, null, null, null, null, null], memoryArmed: false, armedSlot: null, lastStoredSlot: null };
}

/**
 * The Special Mode bank (reference §14): the eight compressed-image macros, entered with
 * MEMORY+SHIFT. Field-preset restore always brings this up OFF (ADR-0015, reference §18).
 * `run` is the finite frame-counted macro run (Vibrate 64f); `orbiting` is Satellite's
 * indefinite orbit (a boolean, not an Infinity runner, so the state stays JSON-serializable).
 */
export interface SpecialModeState {
  active: boolean;
  armed: SpecialMacro | null;
  orbiting: boolean;
  leverPrompt: boolean; // a run was attempted with the lever off B → "move the lever to B first"
  run: TransitionRunner;
}

export const SPECIAL_MODE_OFF: SpecialModeState = {
  active: false,
  armed: null,
  orbiting: false,
  leverPrompt: false,
  run: { ...IDLE_RUNNER },
};

/** A fresh Special-Mode-off value with its own nested runner (never share the const's `run`). */
export function freshSpecialMode(): SpecialModeState {
  return { active: false, armed: null, orbiting: false, leverPrompt: false, run: { ...IDLE_RUNNER } };
}

/** The complete panel state. */
export interface PanelState {
  busA: BusState;
  busB: BusState;
  matte: MatteState;
  digitalEffect: DigitalEffectState;
  transition: TransitionState;
  positioner: PositionerState;
  dsk: DskState;
  audio: AudioState;
  fade: FadeState;
  programOut: ProgramOut;
  /** Shared TRANSITION control (reference §11/§15): Auto Take / Auto Fade duration in frames,
   * quantized to 0..510 in 2-frame steps. One physical knob, one field (ADR-0012). */
  transitionFrames: number;
  system: SystemState;
  /** Event Memory bank + interaction latches (reference §13). Excluded from PanelSnapshot. */
  memory: MemoryState;
  /** Special Mode bank (reference §14). Excluded from PanelSnapshot; never field-preset-restored. */
  specialMode: SpecialModeState;
}

/** Number of Matte colours (Colour Bar, White, Yellow, Cyan, Green, Magenta, Red, Blue, Black). */
export const MATTE_COLOR_COUNT = 9;

/**
 * The single canonical factory preset (reference §18, Reset ON). Every power-up in
 * Reset-ON mode loads exactly this, guarding against odd states after a power fault.
 */
const NEUTRAL_CC: ColourCorrectState = { mode: 'off', chroma: 0.5, joystickX: 0, joystickY: 0 };

export const FACTORY_PRESET: PanelState = {
  busA: { source: 1, substituteSource: 1, colourCorrect: { ...NEUTRAL_CC } },
  busB: { source: 2, substituteSource: 2, colourCorrect: { ...NEUTRAL_CC } },
  matte: { colorIndex: 0, level: 1, gradation: false },
  digitalEffect: {
    bus: 'A',
    armed: null,
    active: { nega: false, mosaic: false, mono: false, paint: false },
    freeze: { still: false, strobe: false, multi: 0, trail: false },
    mosaicSize: 16,
    paintLevel: 0.5,
    strobeTime: 0.5,
    multiTime: 0.5,
    trailTime: 0.5,
    multiMode: 'repeat',
    trailCorner: 'upper-left',
    frameMode: 'frame',
    avSynchro: false,
    avSynchroLevel: 0.5,
    avSynchroEffects: { nega: false, mosaic: false, mono: false, paint: false, still: false, strobe: false },
  },
  transition: {
    type: 'mix',
    lever: 0,
    slice: 0.5,
    hue: 0,
    wipe: {
      family: 'straight',
      variant: 0,
      modifiers: { compression: 0, slide: 0, multi: 0, pairing: false, blinds: false },
      edge: 'hard',
      reverse: false,
      oneWay: false,
      aspect: 0,
      aspectOn: false,
    },
    auto: { ...IDLE_RUNNER },
  },
  positioner: { on: false, x: 0, y: 0, size: 0.2, sceneGrabber: false },
  dsk: {
    on: false,
    fill: 'white',
    keySource: 'ext-camera',
    low: 0,
    high: 1,
    edge: 'normal',
    edgeColorIndex: 1,
    reverse: false,
  },
  audio: {
    // All channels start at zero: the desk comes up silent until the operator
    // raises a fader (owner decision; the hardware remembers no audio preset).
    faders: { a: 0, b: 0, aux1: 0, micAux2: 0, master: 0 },
    micAux2: 'mic',
    audioFollow: false,
  },
  fade: { video: false, dsk: false, audio: false, target: 'black', lever: 0, auto: { ...IDLE_RUNNER } },
  programOut: 'effect',
  transitionFrames: 60,
  system: { reset: 'on' },
  memory: freshMemory(),
  specialMode: freshSpecialMode(),
};

/** Deep structural clone of a panel state (plain JSON, so this is total and safe). */
export function clonePanelState(state: PanelState): PanelState {
  return structuredClone(state);
}

/** Reset both transition runners to idle in place — the single "no in-flight move" site. */
function withRunnersIdle<T extends { transition: TransitionState; fade: FadeState }>(panel: T): T {
  panel.transition = { ...panel.transition, auto: { ...IDLE_RUNNER } };
  panel.fade = { ...panel.fade, auto: { ...IDLE_RUNNER } };
  return panel;
}

/**
 * The single persistable projection (reference §13, ADR-0015): a deep clone of the panel with
 * the transition runners idled and the memory bank + Special Mode stripped. Used by Event
 * Memory STORE and by the persistence module's field-preset capture — one serialisation format.
 * `delete` (not object-rest) keeps banira's pre-ES2016 lib happy.
 */
export function panelSnapshot(state: PanelState): PanelSnapshot {
  const clone = withRunnersIdle(clonePanelState(state));
  const bag = clone as PanelSnapshot & { memory?: MemoryState; specialMode?: SpecialModeState };
  delete bag.memory;
  delete bag.specialMode;
  return bag as PanelSnapshot;
}

/**
 * Field-preset transform (reference §18, Reset OFF): restore the saved snapshot but force the
 * volatile in-flight state to rest. Both transition runners idle; Still and Strobe are never
 * restored; Special Mode always comes up off; the memory interaction latches reset (the bank is
 * kept). Everything else — filters, Multi/Trail, colour correction, wipe/DSK/fade setup,
 * transitionFrames, the stored slots — is preserved (ADR-0011, ADR-0015).
 */
export function fieldPreset(saved: PanelState): PanelState {
  const next = withRunnersIdle(clonePanelState(saved));
  next.digitalEffect = { ...next.digitalEffect, freeze: { ...next.digitalEffect.freeze, still: false, strobe: false } };
  next.specialMode = freshSpecialMode();
  next.memory = { ...next.memory, memoryArmed: false, armedSlot: null, lastStoredSlot: null };
  return next;
}
