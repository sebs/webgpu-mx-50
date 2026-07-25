// Program Out routing (reference §2). The A/B "direct-out" buttons bypass every
// processing stage and send a raw bus; EFFECT sends the full composite. Preview always
// shows the effected video. This module answers "what leaves the unit?" for both video
// and audio at the domain level; audio *gains* are the Web Audio engine's job (ADR-0010).

import { resolveBusSource } from './resolve.js';
import type { PanelState, ProgramOut } from '../state/state.js';
import type { BusId, BusSource } from './types.js';

export interface ProgramVideo {
  mode: ProgramOut;
  /** For A/B direct-out: which bus is sent raw. Undefined for EFFECT. */
  bus?: BusId;
  /** Whether the Digital Effect / Mix/Wipe / DSK / Fade stages are applied. */
  effectApplied: boolean;
}

/** What the Program Out carries (reference §2). A/B bypass effects; EFFECT is the composite. */
export function programVideo(state: PanelState): ProgramVideo {
  switch (state.programOut) {
    case 'A':
      return { mode: 'A', bus: 'A', effectApplied: false };
    case 'B':
      return { mode: 'B', bus: 'B', effectApplied: false };
    case 'effect':
      return { mode: 'effect', effectApplied: true };
  }
}

/** The video a bus's direct-out sends: resolver `directOut` context (Matte -> substitute). */
export function directOutSource(state: PanelState, bus: BusId): BusSource {
  return resolveBusSource(bus === 'A' ? state.busA : state.busB, 'directOut');
}

export type AudioContributor = 'busA' | 'busB' | 'aux1' | 'aux2mic';

export interface ProgramAudio {
  contributors: AudioContributor[];
  /** The Master fader governs only in EFFECT mode (reference §2, §5). */
  masterGoverns: boolean;
}

/** Which audio sources reach the program output, and whether Master governs (reference §2). */
export function programAudio(state: PanelState): ProgramAudio {
  const aux: AudioContributor[] = ['aux1', 'aux2mic'];
  switch (state.programOut) {
    case 'A':
      return { contributors: ['busA', ...aux], masterGoverns: false };
    case 'B':
      return { contributors: ['busB', ...aux], masterGoverns: false };
    case 'effect':
      return { contributors: ['busA', 'busB', ...aux], masterGoverns: true };
  }
}

/** Preview always shows the effected composite, regardless of program mode (reference §2). */
export const PREVIEW_IS_ALWAYS_EFFECTED = true;
