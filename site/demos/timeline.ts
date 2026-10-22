// D22 — the MIDI timeline (ADR-0020): the Overview hero's attract script with its
// transport and lanes open. A live <mx-mixer> plays site/timelines.ts through the player;
// the Mix/Wipe and Fade blocks beside it move because the automation moves the panel —
// they are ordinary connected blocks reading the store. Scrub, frame-step, export the clip as .mid for a DAW,
// import one back, and — with Web MIDI — record a punch-in take or follow a DAW's transport.
//
// Without WebGPU the same player runs against a headless engine (createEngine, on this
// element's own visible-only rAF): no picture beyond the committed recording of the hero,
// but the scrubber, the lanes and the panel readout are the real thing.

import { defineLive } from './live.js';
import { capturedMedia } from './captured.js';
import { DemoElement, defineDemo, reducedMotion, runWhileVisible } from './base.js';
import { el, siteRoot } from '../shell.js';
import { ATTRACT_TIMELINE } from '../timelines.js';
import { playOnMixer } from '../../src/ui/play-timeline.js';
import { createTimelineView } from '../../src/ui/timeline.js';
import { TimelinePlayer } from '../../src/control/timeline-player.js';
import { createEngine } from '../../src/app.js';
import { forwardIndex, REVERSE_OFFSET } from '../../src/core/wipe.js';
import { MAX_DELTA_MS } from '../../src/constants.js';
import type { MxMixer } from '../../src/ui/mixer.js';
import type { MxTimeline } from '../../src/ui/timeline.js';
import type { PanelState } from '../../src/state/state.js';

function three(n: number): string {
  const s = String(n);
  return s.length >= 3 ? s : '000'.slice(s.length) + s;
}

/** One line of what the automation is doing to the panel. */
function summary(s: PanelState): string {
  const t = s.transition;
  const kind = t.type === 'wipe' ? `wipe ${three(forwardIndex(t.wipe.family, t.wipe.variant) + (t.wipe.reverse ? REVERSE_OFFSET : 0))}` : t.type;
  return (
    `lever ${t.lever.toFixed(3)} · ${kind} · A ${String(s.busA.source)} / B ${String(s.busB.source)} · ` +
    `B chroma ${s.busB.colourCorrect.chroma.toFixed(2)} · DSK ${s.dsk.on ? 'on' : 'off'} · fade ${s.fade.lever.toFixed(2)}`
  );
}

interface MidiAccessLike {
  inputs: Map<string, { onmidimessage: ((e: { data: Uint8Array }) => void) | null }>;
  onstatechange: (() => void) | null;
}

class TimelineDemo extends DemoElement {
  protected render(): void {
    defineLive();
    const root = el('div', { class: 'mx-live', attrs: { id: 'timeline-demo' } });
    const mixer = document.createElement('mx-mixer') as MxMixer;
    mixer.className = 'mx-bench wide';
    mixer.setAttribute('feeds', 'pattern');
    mixer.setAttribute('run', 'visible');
    mixer.setAttribute('shared-device', '');
    mixer.setAttribute('width', '960');
    mixer.setAttribute('height', '540');
    const screen = el('div', { class: 'mx-bench-screen' });
    screen.style.aspectRatio = '960 / 540';
    screen.innerHTML = `<span class="mx-chip"><span class="led"></span>starts when on screen</span>`;
    mixer.appendChild(screen);
    const side = el('div', { class: 'mx-bench-side' });
    side.append(document.createElement('mx-mixwipe-block'), document.createElement('mx-fade-block'));
    // The blocks' column is tall: let it span two rows so the timeline sits under the monitor.
    side.style.gridRow = 'span 2';
    mixer.style.gridTemplateRows = 'auto 1fr';
    mixer.appendChild(side);
    const slot = el('div');
    slot.style.minWidth = '0';
    const state = el('p', { class: 'mx-dim', attrs: { style: 'margin:10px 0 0;font-family:var(--mx-mono);font-size:12px' } });
    slot.appendChild(state);
    mixer.appendChild(slot);
    root.appendChild(mixer);

    const bar = el('div', { class: 'mx-bench-bar' });
    const status = el('span', { class: 'mx-chip', html: `<span class="led"></span>waiting` });
    const midiBtn = el('button', { class: 'mx-btn', text: 'Connect MIDI', attrs: { type: 'button', title: 'Play, record and follow from a controller or a DAW (Web MIDI)' } });
    const mid = el('a', {
      class: 'mx-btn',
      text: 'attract.mid',
      attrs: { href: new URL('site/generated/timelines/attract.mid', siteRoot()).href, download: 'attract.mid', title: 'The clip, for a DAW: Ableton profile, channel 1' },
    });
    bar.append(status, midiBtn, mid);
    root.appendChild(bar);
    this.appendChild(root);

    const hasMidi = typeof navigator !== 'undefined' && 'requestMIDIAccess' in navigator;
    if (!hasMidi) midiBtn.hidden = true;

    const start = (player: TimelinePlayer): MxTimeline => {
      const view = createTimelineView(player, { fileName: 'attract' });
      slot.insertBefore(view, state);
      let last = '';
      player.onChange(() => {
        const line = summary(this.snapshot());
        if (line !== last) state.textContent = last = line;
      });
      midiBtn.addEventListener('click', () => {
        const nav = navigator as unknown as { requestMIDIAccess(): Promise<MidiAccessLike> };
        nav.requestMIDIAccess().then(
          (access) => {
            const wire = (): void => {
              for (const input of access.inputs.values()) input.onmidimessage = (e) => player.input(e.data);
              status.innerHTML = `<span class="led"></span>${this.liveLabel} · MIDI: ${access.inputs.size} input${access.inputs.size === 1 ? '' : 's'}`;
            };
            wire();
            access.onstatechange = wire;
            view.attach(player, { fileName: 'attract', midi: true });
            midiBtn.hidden = true;
          },
          () => {
            midiBtn.textContent = 'MIDI permission denied';
            midiBtn.setAttribute('disabled', '');
          },
        );
      });
      return view;
    };

    mixer.addEventListener('mx-unavailable', (e) => {
      e.preventDefault();
      root.classList.add('unavailable');
      const media = el('div', { class: 'mx-bench-screen poster' });
      media.appendChild(capturedMedia('hero-monitor', 'the attract loop this timeline plays'));
      slot.style.marginTop = '12px';
      root.insertBefore(media, bar);
      root.insertBefore(slot, bar); // out of the mixer before it goes
      mixer.remove();
      this.liveLabel = 'headless · no picture without WebGPU';
      status.innerHTML = `<span class="led"></span>${this.liveLabel}`;
      // The same player, on a headless engine stepped by this element's visible-only rAF.
      const engine = createEngine();
      const pre = new Set<(tick: number) => void>();
      const player = new TimelinePlayer(
        {
          store: engine.store,
          tick: () => engine.clock.tick,
          beforeFrame: (fn) => {
            pre.add(fn);
            return () => void pre.delete(fn);
          },
        },
        ATTRACT_TIMELINE,
        { autoplay: !reducedMotion() },
      );
      this.snapshot = () => engine.store.getSnapshot();
      let lastMs = 0;
      this.onDispose(
        runWhileVisible(this, (ms) => {
          const delta = ms < lastMs ? 0 : ms - lastMs;
          lastMs = ms;
          engine.clock.accumulate(delta > MAX_DELTA_MS ? MAX_DELTA_MS : delta);
          const tick = engine.clock.tick;
          for (const fn of pre) fn(tick);
          engine.store.dispatch({ type: 'ADVANCE_TIMELINE', tick });
        }),
      );
      this.onDispose(() => player.detach());
      start(player);
    });

    mixer.addEventListener(
      'mx-ready',
      () => {
        screen.remove();
        root.classList.add('ready');
        mixer.querySelector(':scope > canvas')?.setAttribute('data-loop', '');
        status.className = 'mx-chip live';
        status.innerHTML = `<span class="led"></span>${this.liveLabel}`;
        const player = playOnMixer(mixer, ATTRACT_TIMELINE, { autoplay: !reducedMotion() });
        this.snapshot = () => mixer.context!.store.getSnapshot();
        this.onDispose(() => player.detach());
        start(player);
      },
      { once: true },
    );
  }

  private liveLabel = 'live · pauses off screen';
  private snapshot: () => PanelState = () => {
    throw new Error('not running');
  };
}

defineDemo('mx-demo-timeline', TimelineDemo);
