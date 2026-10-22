// Play a MIDI timeline (ADR-0020) on a running <mx-mixer>: the player on the host's
// beforeFrame hook — an embedder-surface member the context does not carry (ADR-0017) — and
// the `feeds="pattern"` pictures on the playhead, so a seek moves the picture too. Kept apart
// from the <mx-timeline> view so a page that only plays (the Overview hero) loads no chrome.

import { TimelinePlayer } from '../control/timeline-player.js';
import type { TimelinePlayerOptions } from '../control/timeline-player.js';
import type { MidiTimeline } from '../control/midi-timeline.js';
import type { MxMixer } from './mixer.js';

export function playOnMixer(mixer: MxMixer, timeline: MidiTimeline, options?: TimelinePlayerOptions): TimelinePlayer {
  const ctx = mixer.context;
  if (!ctx) throw new Error('the mixer is not running');
  const player = new TimelinePlayer({ store: ctx.store, tick: ctx.tick, beforeFrame: (fn) => mixer.beforeFrame(fn) }, timeline, options);
  mixer.feedTick = (tick) => tick - player.anchor;
  return player;
}
