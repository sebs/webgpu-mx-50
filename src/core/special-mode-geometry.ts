// Special-Mode macro geometry (reference §14): the pure per-frame picture math of the
// eight compressed-image macros. For a macro at progress p (and tick, for the orbit/shake
// phases) it yields which layer fills the background, which is compressed into the inset,
// and the inset's centre/half-extents/rotation — consumed by gpu/special-fx.ts and the
// headless specs so the WGSL and the tests share one formula (ADR-0012: tick-driven, no
// wall clock). Progress sources: the Mix/Wipe lever for the compressed macros (they run as
// a standard take), specialMode.run for Shutter/Vibrate, the logical tick for Satellite.
//
// banira lib floor: no Array.includes / ** (use indexOf, x*x, Math.pow).

import { VIBRATE_FRAMES } from './special-mode.js';
import type { SpecialMacro } from './special-mode.js';
import type { PanelState } from '../state/state.js';

export type SpecialLayer = 'A' | 'B' | 'matte' | 'black' | 'none';

/** One rendered macro frame: bg fills the screen, fg compresses into the inset. */
export interface SpecialFrame {
  bg: Exclude<SpecialLayer, 'none'>;
  fg: SpecialLayer;
  center: [number, number];
  /** Inset half-extents in UV ([0.5, 0.5] = full frame). */
  half: [number, number];
  /** Rotation about the inset centre, radians. */
  angle: number;
  /** 0 = rect (L∞), 1 = ellipse (L2). */
  shape: 0 | 1;
  /** Crossfade amount, used only by mosaic-mix (fg 'none'). */
  mix: number;
  /** Mosaic strength 0..1, used only by mosaic-mix. */
  mosaic: number;
}

export const CORK_TURNS = 2;
const CORK_THETA0 = (-3 * Math.PI) / 4; // upper-left in y-down UV
const CORK_R0 = Math.sqrt(0.5);
export const BOUNCE_PHASE = 0.75;
export const BOUNCE_HALF = 0.25;
export const VIBRATE_AMPLITUDE = 0.05;
export const VIBRATE_CYCLE_FRAMES = 4;
export const SATELLITE_ORBIT_FRAMES = 180;
export const SATELLITE_ORBIT_RADIUS = 0.3;
export const SATELLITE_HALF = 0.125;

/** The two Stream corners selectable via the Positioner Joystick (reference §14, mirrors §8.8). */
export function streamCorner(joystickX: number): 'upper-left' | 'upper-right' {
  return joystickX < 0 ? 'upper-left' : 'upper-right';
}

/** Analytic damped 2-bounce height for the Bounce drop phase, q in 0..1. */
export function bounceHeight(q: number): number {
  if (q < 0.5) {
    const u = q / 0.5;
    return 1 - u * u;
  }
  if (q < 0.8) {
    const u = (q - 0.5) / 0.3;
    return 0.35 * 4 * u * (1 - u);
  }
  if (q < 0.95) {
    const u = (q - 0.8) / 0.15;
    return 0.12 * 4 * u * (1 - u);
  }
  return 0;
}

/** Shader layer encodings — pinned here so units and step defs share them. */
export function bgLayerCode(l: Exclude<SpecialLayer, 'none'>): number {
  return l === 'A' ? 0 : l === 'B' ? 1 : l === 'matte' ? 2 : 3;
}
export function fgLayerCode(l: SpecialLayer): number {
  return l === 'A' ? 0 : l === 'B' ? 1 : 2;
}

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);

/** The macro picture at progress p (0..1). `tick` drives Satellite's orbit and Vibrate's shake phase. */
export function macroFrame(
  macro: SpecialMacro,
  p: number,
  tick: number,
  opts: { joystickX: number; squareWipe: boolean },
): SpecialFrame {
  const q = clamp01(p);
  switch (macro) {
    case 'mosaic-mix':
      return { bg: 'A', fg: 'none', center: [0.5, 0.5], half: [0.5, 0.5], angle: 0, shape: 0, mix: q, mosaic: 4 * q * (1 - q) };
    case 'stream': {
      const h = 0.5 * q;
      const corner = streamCorner(opts.joystickX);
      const center: [number, number] = corner === 'upper-left' ? [h, h] : [1 - h, h];
      return { bg: 'A', fg: 'B', center, half: [h, h], angle: 0, shape: 0, mix: 0, mosaic: 0 };
    }
    case 'cork-screw': {
      const theta = CORK_THETA0 + CORK_TURNS * 2 * Math.PI * q;
      const r = CORK_R0 * (1 - q);
      return {
        bg: 'A',
        fg: 'B',
        center: [0.5 + r * Math.cos(theta), 0.5 + r * Math.sin(theta)],
        half: [0.5 * q, 0.5 * q],
        angle: CORK_TURNS * 2 * Math.PI * (1 - q),
        shape: 0,
        mix: 0,
        mosaic: 0,
      };
    }
    case 'bounce': {
      if (q <= BOUNCE_PHASE) {
        const y = bounceHeight(q / BOUNCE_PHASE);
        return { bg: 'A', fg: 'B', center: [0.5, 0.75 - y], half: [BOUNCE_HALF, BOUNCE_HALF], angle: 0, shape: 0, mix: 0, mosaic: 0 };
      }
      const e = (q - BOUNCE_PHASE) / (1 - BOUNCE_PHASE);
      const h = 0.25 + 0.25 * e;
      // The bottom edge stays pinned to the floor while the picture grows to full frame.
      return { bg: 'A', fg: 'B', center: [0.5, 0.75 - 0.25 * e], half: [h, h], angle: 0, shape: 0, mix: 0, mosaic: 0 };
    }
    case 'flip': {
      if (q < 0.5) {
        return { bg: 'matte', fg: 'A', center: [0.5, 0.5], half: [0.5 * (1 - 2 * q), 0.5], angle: 0, shape: 0, mix: 0, mosaic: 0 };
      }
      return { bg: 'matte', fg: 'B', center: [0.5, 0.5], half: [0.5 * (2 * q - 1), 0.5], angle: 0, shape: 0, mix: 0, mosaic: 0 };
    }
    case 'shutter': {
      if (opts.squareWipe) {
        const h = 0.5 * (1 - q);
        return { bg: 'matte', fg: 'B', center: [0.5, 0.5], half: [h, h], angle: 0, shape: 1, mix: 0, mosaic: 0 };
      }
      return { bg: 'matte', fg: 'B', center: [0.5, 0.5], half: [0.5, 0.5 * (1 - q)], angle: 0, shape: 0, mix: 0, mosaic: 0 };
    }
    case 'vibrate': {
      const shiftX = VIBRATE_AMPLITUDE * (1 - q) * Math.sin((2 * Math.PI * q * VIBRATE_FRAMES) / VIBRATE_CYCLE_FRAMES);
      return { bg: 'black', fg: 'B', center: [0.5 + shiftX, 0.5], half: [0.5, 0.5], angle: 0, shape: 0, mix: 0, mosaic: 0 };
    }
    case 'satellite': {
      const phi = 2 * Math.PI * (((Math.floor(tick) % SATELLITE_ORBIT_FRAMES) + SATELLITE_ORBIT_FRAMES) % SATELLITE_ORBIT_FRAMES / SATELLITE_ORBIT_FRAMES);
      return {
        bg: 'A',
        fg: 'B',
        center: [0.5 + SATELLITE_ORBIT_RADIUS * Math.cos(phi), 0.5 + SATELLITE_ORBIT_RADIUS * Math.sin(phi)],
        half: [SATELLITE_HALF, SATELLITE_HALF],
        angle: 0,
        shape: 0,
        mix: 0,
        mosaic: 0,
      };
    }
  }
}

/**
 * The single renderer gate: the macro picture to composite this frame, or null when the
 * normal Mix/Wipe path should render. Lever-family macros (Mosaic Mix/Stream/Cork
 * Screw/Bounce/Flip) read the Mix/Wipe lever directly (they run as a standard take, and
 * their endpoints degenerate to full A / full B so arming never glitches the picture);
 * Shutter holds its reveal at run completion; Vibrate ends where it began (plain B);
 * Satellite renders only while orbiting.
 */
export function specialFrame(state: PanelState, tick: number): SpecialFrame | null {
  const sm = state.specialMode;
  if (!sm.active || sm.armed === null) return null;
  const opts = { joystickX: state.positioner.x, squareWipe: state.transition.wipe.family === 'square' };
  switch (sm.armed) {
    case 'satellite':
      return sm.orbiting ? macroFrame('satellite', 1, tick, opts) : null;
    case 'vibrate':
      if (sm.run.phase === 'idle' || sm.run.phase === 'complete') return null;
      return macroFrame('vibrate', sm.run.progress, tick, opts);
    case 'shutter':
      if (sm.run.phase === 'idle') return null;
      return macroFrame('shutter', sm.run.progress, tick, opts);
    default:
      return macroFrame(sm.armed, state.transition.lever, tick, opts);
  }
}
