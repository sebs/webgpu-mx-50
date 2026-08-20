// MIDI-learn targets (ADR-0018): the curated list of logical controls the learn UI offers,
// with enough metadata to turn a classified capture (midi.ts classifyCapture) into a Binding.
// Pure data + one pure constructor — the panel UI stays dumb and the mapping stays testable.
//
// banira lib floor: no Array.includes / **.

import type { Binding } from './bindings.js';
import type { LearnedInput } from './midi.js';
import type { LogicalControlId } from './logical-control.js';

export type LearnKind = 'continuous' | 'trigger' | 'toggle' | 'valued';

export interface LearnTarget {
  control: LogicalControlId;
  label: string;
  kind: LearnKind;
  /** Fixed value for 'valued' targets (a source number, a recall slot). */
  value?: number;
}

export const LEARN_TARGETS: readonly LearnTarget[] = [
  // Continuous surfaces — a CC (plain, 14-bit pair, or relative encoder) or note velocity.
  { control: 'lever.position', label: 'Mix/Wipe lever', kind: 'continuous' },
  { control: 'fade.lever', label: 'Fade lever', kind: 'continuous' },
  { control: 'key.slice', label: 'Key slice', kind: 'continuous' },
  { control: 'key.hue', label: 'Key hue', kind: 'continuous' },
  { control: 'positioner.x', label: 'Positioner X', kind: 'continuous' },
  { control: 'positioner.y', label: 'Positioner Y', kind: 'continuous' },
  { control: 'positioner.size', label: 'Positioner size', kind: 'continuous' },
  { control: 'ccA.chroma', label: 'Chroma A', kind: 'continuous' },
  { control: 'ccB.chroma', label: 'Chroma B', kind: 'continuous' },
  { control: 'audio.a', label: 'Audio A', kind: 'continuous' },
  { control: 'audio.b', label: 'Audio B', kind: 'continuous' },
  { control: 'audio.aux1', label: 'Audio Aux1', kind: 'continuous' },
  { control: 'audio.micAux2', label: 'Audio Mic/Aux2', kind: 'continuous' },
  { control: 'audio.master', label: 'Audio master', kind: 'continuous' },
  // Momentary + cycling.
  { control: 'autoTake.trigger', label: 'Auto take', kind: 'trigger' },
  { control: 'autoFade.trigger', label: 'Auto fade', kind: 'trigger' },
  { control: 'memory.storeArm', label: 'Memory store-arm', kind: 'trigger' },
  { control: 'programOut', label: 'Program out (cycle)', kind: 'toggle' },
  { control: 'transition.type', label: 'Transition (cycle)', kind: 'toggle' },
  // Valued selections.
  { control: 'busA.source', label: 'Bus A · source 1', kind: 'valued', value: 1 },
  { control: 'busA.source', label: 'Bus A · source 2', kind: 'valued', value: 2 },
  { control: 'busA.source', label: 'Bus A · source 3', kind: 'valued', value: 3 },
  { control: 'busA.source', label: 'Bus A · source 4', kind: 'valued', value: 4 },
  { control: 'busB.source', label: 'Bus B · source 1', kind: 'valued', value: 1 },
  { control: 'busB.source', label: 'Bus B · source 2', kind: 'valued', value: 2 },
  { control: 'busB.source', label: 'Bus B · source 3', kind: 'valued', value: 3 },
  { control: 'busB.source', label: 'Bus B · source 4', kind: 'valued', value: 4 },
  { control: 'memory.recall', label: 'Recall preset 1', kind: 'valued', value: 1 },
  { control: 'memory.recall', label: 'Recall preset 2', kind: 'valued', value: 2 },
  { control: 'memory.recall', label: 'Recall preset 3', kind: 'valued', value: 3 },
  { control: 'memory.recall', label: 'Recall preset 4', kind: 'valued', value: 4 },
  { control: 'memory.recall', label: 'Recall preset 5', kind: 'valued', value: 5 },
  { control: 'memory.recall', label: 'Recall preset 6', kind: 'valued', value: 6 },
  { control: 'memory.recall', label: 'Recall preset 7', kind: 'valued', value: 7 },
  { control: 'memory.recall', label: 'Recall preset 8', kind: 'valued', value: 8 },
];

/**
 * Turn a classified capture into the Binding for its address (ADR-0018 classification):
 * continuous CCs bind as absolute `set` (14-bit when a pair was observed, relative encoders
 * as marked), notes drive continuous targets by velocity; triggers/toggles/valued targets
 * bind by their nature regardless of input kind.
 */
export function learnedBinding(target: LearnTarget, learned: LearnedInput): Binding {
  if (target.kind === 'trigger') return { control: target.control, mode: 'trigger' };
  if (target.kind === 'toggle') return { control: target.control, mode: 'toggle' };
  if (target.kind === 'valued') return { control: target.control, mode: 'set', value: target.value };
  // Continuous.
  if (learned.kind === 'cc') {
    if (learned.relative) return { control: target.control, mode: 'set', relative: true };
    if (learned.fine) return { control: target.control, mode: 'set', fine: true };
    return { control: target.control, mode: 'set', range: { lo: 0, hi: 127 } };
  }
  // A note driving a continuous target: velocity becomes the value (adapter fallback).
  return { control: target.control, mode: 'set' };
}
