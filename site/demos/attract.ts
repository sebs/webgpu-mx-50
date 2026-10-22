// D1 — attract mode for the Overview hero (docs/WEBSITE.md §4.1). A wide <mx-mixer> on the
// pattern feeds plays the attract MIDI timeline (site/timelines.ts, ADR-0020): five acts,
// each a preset recalled by Program Change, the take on 14-bit lever automation, and an
// Auto Fade to black to close the loop. The same timeline, with its transport and lanes
// open, is the scripted-demo on /architecture/.
//
// The hero is ephemeral by construction — a mixer without `persist` never reads or writes
// the visitor's saved console state. Its loop runs only while it is on screen and the tab
// is visible (run="visible"), and the timeline runs on that loop, so it pauses with it; the
// pattern feeds follow the playhead, so a loop of the timeline is a loop of the picture.
// With prefers-reduced-motion there is no hero at all: the feeds themselves move.

import type { MxMixer } from '../../src/ui/mixer.js';
import { playOnMixer } from '../../src/ui/play-timeline.js';
import { el } from '../shell.js';
import { defineLive } from './live.js';
import { capturedMedia } from './captured.js';
import { LOOPS } from '../posters.js';
import { reducedMotion } from './base.js';
import { ATTRACT_TIMELINE } from '../timelines.js';

/** The hero monitor; removes itself where WebGPU is unavailable. */
export function attractMonitor(): HTMLElement {
  const wrap = el('div', { class: 'mx-hero-monitor', attrs: { id: 'hero-monitor' } });
  if (reducedMotion()) {
    wrap.hidden = true;
    return wrap;
  }
  defineLive();
  const mixer = document.createElement('mx-mixer') as MxMixer;
  mixer.setAttribute('feeds', 'pattern');
  mixer.setAttribute('run', 'visible');
  mixer.setAttribute('shared-device', '');
  mixer.setAttribute('width', '1280');
  mixer.setAttribute('height', '720');
  mixer.setAttribute('aria-label', 'The mixer in attract mode');
  wrap.appendChild(mixer);
  const chips = el('div', { class: 'mx-chip-row' });
  const live = el('span', { class: 'mx-chip live', html: '<span class="led"></span>Attract mode · the real renderer' });
  const act = el('span', { class: 'mx-chip', text: '' });
  chips.append(live, act);
  wrap.appendChild(chips);

  // No WebGPU: the hero goes away (preventDefault suppresses the host's inline message).
  // It must not start hidden, though — a display:none host never intersects, so a
  // run="visible" mixer inside it would never boot.
  chips.hidden = true;
  mixer.addEventListener('mx-unavailable', (e) => {
    e.preventDefault();
    if (LOOPS.indexOf('hero-monitor') === -1) {
      wrap.hidden = true;
      return;
    }
    // No WebGPU: the committed recording of this very loop, labelled as a recording.
    mixer.remove();
    const media = el('div', { class: 'mx-bench-screen poster' });
    media.appendChild(capturedMedia('hero-monitor', 'the attract loop'));
    wrap.insertBefore(media, chips);
    chips.remove();
  });

  mixer.addEventListener(
    'mx-ready',
    () => {
      chips.hidden = false;
      wrap.classList.add('ready');
      mixer.querySelector(':scope > canvas')?.setAttribute('data-loop', '');
      const player = playOnMixer(mixer, ATTRACT_TIMELINE);
      player.onChange(() => {
        const label = player.marker ? player.marker.label : '';
        if (act.textContent !== label) act.textContent = label;
      });
    },
    { once: true },
  );
  return wrap;
}
