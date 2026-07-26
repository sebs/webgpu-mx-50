// Downstream Key domain (reference §10). The DSK sits after Mix/Wipe, before Fade, keying
// a title source over the finished composite. Edge-style ring, luminance window, fill and
// edge colour rules, REVERSE polarity, and key-source resolution (Matte -> substitute per
// ADR-0006). Pure and GPU-free.

import { matteFlatColor, matteColorAt } from './matte.js';
import { resolveBusSource } from './resolve.js';
import type { BusSource } from './types.js';
import type { DskEdgeStyle, DskState, MatteState, PanelState } from '../state/state.js';

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
