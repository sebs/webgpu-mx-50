// Downstream Key domain (reference §10). The DSK sits after Mix/Wipe, before Fade, keying
// a title source over the finished composite. Edge-style ring, luminance window, fill and
// edge colour rules, REVERSE polarity, and key-source resolution (Matte -> substitute per
// ADR-0006). Pure and GPU-free.

import { matteFlatColor, matteColorAt } from './matte.js';
import { resolveBusSource } from './resolve.js';
import type { BusSource } from './types.js';
import type { DskEdgeStyle, DskKeySource, DskState, MatteState, PanelState } from '../state/state.js';

/** The EDGE button cycles this ring (reference §10). */
export const DSK_EDGE_STYLES: readonly DskEdgeStyle[] = [
  'normal',
  'narrow-border',
  'wide-border',
  'narrow-shadow',
  'wide-shadow',
  'drop-shadow',
];

const EDGE_LABELS: Record<DskEdgeStyle, string> = {
  normal: 'Normal',
  'narrow-border': 'Narrow Border',
  'wide-border': 'Wide Border',
  'narrow-shadow': 'Narrow Shadow',
  'wide-shadow': 'Wide Shadow',
  'drop-shadow': 'Drop Shadow',
};

export function dskEdgeStyleLabel(style: DskEdgeStyle): string {
  return EDGE_LABELS[style];
}

export function dskEdgeStyleByLabel(label: string): DskEdgeStyle {
  const found = (Object.keys(EDGE_LABELS) as DskEdgeStyle[]).find((k) => EDGE_LABELS[k] === label);
  if (!found) throw new Error(`Unknown DSK edge style: ${label}`);
  return found;
}

export function nextDskEdgeStyle(style: DskEdgeStyle): DskEdgeStyle {
  const i = DSK_EDGE_STYLES.indexOf(style);
  return DSK_EDGE_STYLES[(i + 1) % DSK_EDGE_STYLES.length]!;
}

export function edgeHasBorderOrShadow(style: DskEdgeStyle): boolean {
  return style !== 'normal';
}

// --- edge-style geometry (reference §10) ------------------------------------
// The ring/shadow measurements the DSK shader renders. Borders are a coloured ring
// hugging the keyed characters; shadows are a darkened offset copy behind them
// (attached via a contact edge); Drop Shadow is a hard detached offset silhouette.

export type DskEdgeKind = 'none' | 'border' | 'shadow' | 'drop-shadow';

export interface DskEdgeGeometry {
  kind: DskEdgeKind;
  /** Ring dilation radius, uv frame-height units. */
  borderWidth: number;
  /** Shadow offset in uv, +x right / +y down. */
  shadowOffset: [number, number];
  /** 0 = n/a, 0.75 = soft attached shadow, 1 = hard drop shadow. */
  shadowOpacity: number;
}

export function dskEdgeGeometry(style: DskEdgeStyle): DskEdgeGeometry {
  switch (style) {
    case 'normal':
      return { kind: 'none', borderWidth: 0, shadowOffset: [0, 0], shadowOpacity: 0 };
    case 'narrow-border':
      return { kind: 'border', borderWidth: 0.004, shadowOffset: [0, 0], shadowOpacity: 0 };
    case 'wide-border':
      return { kind: 'border', borderWidth: 0.01, shadowOffset: [0, 0], shadowOpacity: 0 };
    case 'narrow-shadow':
      return { kind: 'shadow', borderWidth: 0, shadowOffset: [0.006, 0.006], shadowOpacity: 0.75 };
    case 'wide-shadow':
      return { kind: 'shadow', borderWidth: 0, shadowOffset: [0.014, 0.014], shadowOpacity: 0.75 };
    case 'drop-shadow':
      return { kind: 'drop-shadow', borderWidth: 0, shadowOffset: [0.014, 0.014], shadowOpacity: 1 };
  }
}

/** The shader enum for an edge kind — single source for the uniform value. */
export const DSK_EDGE_MODE: Record<DskEdgeKind, number> = { none: 0, border: 1, shadow: 2, 'drop-shadow': 3 };

/** GRADATION grades the edge only where a matte edge colour is selectable (white fill). */
export function dskEdgeGraded(dsk: DskState, matte: MatteState): boolean {
  return dsk.fill === 'white' && matte.gradation;
}

/** The Low/High Level Key sliders as a sorted luminance window (reference §10). */
export function dskKeyWindow(dsk: DskState): { lo: number; hi: number } {
  return { lo: Math.min(dsk.low, dsk.high), hi: Math.max(dsk.low, dsk.high) };
}

/** Whether a luminance value falls in the "character" window (REVERSE swaps character/background). */
export function isDskCharacter(luma: number, dsk: DskState): boolean {
  const { lo, hi } = dskKeyWindow(dsk);
  const inWindow = luma >= lo && luma <= hi;
  return dsk.reverse ? !inWindow : inWindow;
}

/** The fill inside the keyed characters: WHITE, or the selected Matte colour (reference §10). */
export function dskFillColour(dsk: DskState, matte: MatteState): [number, number, number] {
  return dsk.fill === 'white' ? [1, 1, 1] : matteFlatColor(matte);
}

/** The edge colour is selectable only when the fill is WHITE (reference §10). */
export function dskEdgeColourSelectable(dsk: DskState): boolean {
  return dsk.fill === 'white';
}

/** The character edge colour: a matte fill forces black; a white fill uses the chosen matte colour. */
export function dskEdgeColour(dsk: DskState): [number, number, number] {
  if (dsk.fill === 'matte') return [0, 0, 0];
  const [r, g, b] = matteColorAt(dsk.edgeColorIndex).rgb;
  return [r, g, b];
}

/**
 * The key source the DSK derives its title luminance from: the External Camera, or a bus
 * resolved through the `dsk` context so Matte is never keyed (blinking substitute, ADR-0006).
 */
export function dskKeySource(state: PanelState): 'ext-camera' | BusSource {
  const dsk = state.dsk;
  if (dsk.keySource === 'ext-camera') return 'ext-camera';
  const bus = dsk.keySource === 'A' ? state.busA : state.busB;
  return resolveBusSource(bus, 'dsk');
}

/** What texture feeds the DSK key window at the GPU. */
export type DskKeyFeed = 'A' | 'B' | 'camera' | 'composite';

/**
 * What feeds the DSK key window: a bus, the live External Camera, or — when EXT. CAMERA
 * is selected but no camera is granted/delivering — the pre-fade composite stand-in (the
 * documented fallback while no camera is attached).
 */
export function dskKeyFeed(keySource: DskKeySource, cameraLive: boolean): DskKeyFeed {
  if (keySource === 'A') return 'A';
  if (keySource === 'B') return 'B';
  return cameraLive ? 'camera' : 'composite';
}
