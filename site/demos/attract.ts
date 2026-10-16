// D1 — attract mode for the Overview hero (docs/WEBSITE.md §4.1). A wide <mx-mixer> on the
// pattern feeds runs a scripted loop through the automation API (src/control/automation.ts,
// the RS-422 analogue): each act sets something up, then fires an Auto Take, which glides
// the lever to the other end over the transition time.
//
// The three pieces §4.1 listed are all in place: the automation surface has CC and DSK
// ops; the API is built over the host's own store and clock; and the hero is ephemeral by
// construction — a mixer without `persist` never reads or writes the visitor's saved
// console state. A new act only fires when the previous take has finished, the tab is
// visible, and the hero is on screen (its loop is paused otherwise, so the take would not
// advance). With prefers-reduced-motion there is no hero at all: the feeds themselves move.

import { createAutomation } from '../../src/control/automation.js';
import type { AutomationApi } from '../../src/control/automation.js';
import type { MxMixer } from '../../src/ui/mixer.js';
import type { Command } from '../../src/state/commands.js';
import type { PanelState } from '../../src/state/state.js';
import { el } from '../shell.js';
import { defineLive, factoryState, capturedMedia } from './live.js';
import { LOOPS } from '../posters.js';
import { reducedMotion } from './base.js';

const ACT_MS = 4200;
const TAKE_FRAMES = 70;

interface Act {
  readonly label: string;
  readonly run: (api: AutomationApi, dispatch: (c: Command) => void) => void;
}

const ACTS: readonly Act[] = [
  {
    label: 'Mix · Auto Take',
    run: (api, d) => {
      d({ type: 'LOAD_STATE', state: factoryState() });
      d({ type: 'ASSIGN_SOURCE', bus: 'A', source: 2 });
      d({ type: 'ASSIGN_SOURCE', bus: 'B', source: 3 });
      d({ type: 'SET_TRANSITION_TYPE', transition: 'mix' });
      api.runTransition(TAKE_FRAMES);
    },
  },
  {
    label: 'Wipe 009 · border',
    run: (api, d) => {
      d({ type: 'SET_TRANSITION_TYPE', transition: 'wipe' });
      api.selectWipePattern(9);
      d({ type: 'PRESS_BORDER' });
      api.runTransition(TAKE_FRAMES);
    },
  },
  {
    label: 'Mosaic on bus A · wipe 137',
    run: (api, d) => {
      d({ type: 'SELECT_EFFECT_BUS', bus: 'A' });
      d({ type: 'CHOOSE_EFFECT', effect: 'mosaic' });
      d({ type: 'PRESS_EFFECT_ON' });
      api.selectWipePattern(137);
      api.runTransition(TAKE_FRAMES);
    },
  },
  {
    label: 'Colour correction on B · NAM',
    run: (api, d) => {
      api.setColourCorrection('B', { mode: 'chroma-plus-joystick', chroma: 0.35, x: 0.6, y: -0.3 });
      d({ type: 'SET_TRANSITION_TYPE', transition: 'nam' });
      api.runTransition(TAKE_FRAMES);
    },
  },
  {
    label: 'Downstream key · drop shadow',
    run: (api, d) => {
      d({ type: 'ASSIGN_SOURCE', bus: 'B', source: 4 });
      d({ type: 'SET_TRANSITION_TYPE', transition: 'wipe' });
      api.selectWipePattern(17);
      api.setDsk({ on: true, keySource: 'A', low: 0.8, high: 1, edge: 'drop-shadow' });
      api.runTransition(TAKE_FRAMES);
    },
  },
];

function takeRunning(state: PanelState): boolean {
  return state.transition.auto.phase === 'running' || state.transition.auto.phase === 'paused';
}

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
    const media = el('div', { class: 'mx-bench-screen poster', html: capturedMedia('hero-monitor', 'the attract loop') });
    wrap.insertBefore(media, chips);
    chips.remove();
  });

  let onScreen = false;
  new IntersectionObserver((entries) => {
    onScreen = entries[entries.length - 1]!.isIntersecting;
  }).observe(wrap);

  mixer.addEventListener(
    'mx-ready',
    () => {
      chips.hidden = false;
      wrap.classList.add('ready');
      mixer.querySelector(':scope > canvas')?.setAttribute('data-loop', '');
      const ctx = mixer.context!;
      const dispatch = (c: Command): void => ctx.store.dispatch(c);
      const api = createAutomation(() => ctx.store.getSnapshot(), dispatch, ctx.tick);

      let next = 0;
      const step = (): void => {
        const a = ACTS[next % ACTS.length]!;
        a.run(api, dispatch);
        act.textContent = a.label;
        next++;
      };
      step();
      window.setInterval(() => {
        if (document.hidden || !onScreen || takeRunning(ctx.store.getSnapshot())) return;
        step();
      }, ACT_MS);
    },
    { once: true },
  );
  return wrap;
}
