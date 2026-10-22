// <mx-timeline> — the MIDI timeline view (ADR-0020): transport, a lane strip (Program
// Change pills, note ticks, CC envelopes, markers) with the playhead over it, an mx-slider
// scrubber, and import/export of the timeline as a Standard MIDI File or JSON. Page-level
// chrome like the MIDI panel, not a connected block: the TimelinePlayer needs the host's
// beforeFrame hook, which the context does not carry (ADR-0017), so the composition root
// builds the player and attaches it here. The view never touches the store.
//
// Keyboard (while focus is inside): Space plays/pauses, , and . step one frame, Home/End
// jump; the scrubber is a full ARIA slider whose value text names the frame and the act.

import { ensureTheme } from './theme.js';
import { ledButton } from './blocks/parts.js';
import { createSlider } from './primitives/slider.js';
import { sampleCcLane, validateTimeline } from '../control/midi-timeline.js';
import { timelineFromSmf, writeSmf } from '../control/smf.js';
import type { TimelinePlayer } from '../control/timeline-player.js';
import type { MidiTimeline } from '../control/midi-timeline.js';
import type { LedButton } from './blocks/parts.js';
import type { MxSlider } from './primitives/slider.js';

const STYLE = `
mx-timeline { display: block; }
mx-timeline .mx-tl-lanes { position: relative; height: var(--mx-tl-h, 96px); border-radius: 5px; overflow: hidden;
  background: var(--mx-bg-deep); box-shadow: inset 0 1px 4px rgba(0,0,0,0.8); cursor: col-resize; touch-action: none; }
mx-timeline .mx-tl-lanes canvas { position: absolute; inset: 0; width: 100%; height: 100%; }
mx-timeline .mx-tl-head { position: absolute; top: 0; bottom: 0; width: 1px; margin-left: -0.5px; background: var(--mx-text);
  box-shadow: 0 0 6px rgba(255,255,255,0.5); pointer-events: none; }
mx-timeline .mx-tl-time { font: 500 13px/1 var(--mx-mono); color: var(--mx-amber); text-shadow: 0 0 10px rgba(242,162,60,0.35);
  white-space: nowrap; }
mx-timeline .mx-tl-act { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
mx-timeline .mx-row { flex-wrap: wrap; }
mx-timeline .mxled { flex: none; }
`;

const LANE_H = 18;
const MARKER_H = 14;

export interface TimelineViewOptions {
  /** Show Record and Follow (the composition root has wired a MIDI input to player.input). */
  midi?: boolean;
  /** Base name for exported files (default: the timeline title). */
  fileName?: string;
}

function token(el: Element, name: string, fallback: string): string {
  const v = getComputedStyle(el).getPropertyValue(name).trim();
  return v || fallback;
}

function frameText(frame: number): string {
  const s = String(frame);
  return s.length >= 4 ? s : '0000'.slice(s.length) + s;
}

function download(name: string, type: string, data: BlobPart): void {
  const url = URL.createObjectURL(new Blob([data], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export class MxTimeline extends HTMLElement {
  private player: TimelinePlayer | null = null;
  private options: TimelineViewOptions = {};
  private unsubscribe: (() => void) | null = null;
  private resize: ResizeObserver | null = null;
  private drawn: MidiTimeline | null = null;

  private canvas: HTMLCanvasElement | null = null;
  private lanes: HTMLElement | null = null;
  private head: HTMLElement | null = null;
  private slider: MxSlider | null = null;
  private time: HTMLElement | null = null;
  private act: HTMLElement | null = null;
  private status: HTMLElement | null = null;
  private playBtn: LedButton | null = null;
  private loopBtn: LedButton | null = null;
  private recBtn: LedButton | null = null;
  private followBtn: LedButton | null = null;
  private last = '';

  /** Wire a page-owned player in; builds (or rebuilds) the view. */
  attach(player: TimelinePlayer, options: TimelineViewOptions = {}): void {
    this.detachPlayer();
    this.player = player;
    this.options = options;
    this.build();
    this.unsubscribe = player.onChange(() => this.refresh());
    this.refresh();
  }

  disconnectedCallback(): void {
    this.detachPlayer();
  }

  private detachPlayer(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.resize?.disconnect();
    this.resize = null;
  }

  private build(): void {
    const player = this.player!;
    ensureTheme();
    if (!document.getElementById('mx-timeline-style')) {
      const style = document.createElement('style');
      style.id = 'mx-timeline-style';
      style.textContent = STYLE;
      document.head.appendChild(style);
    }
    this.textContent = '';
    this.drawn = null;
    const block = document.createElement('div');
    block.className = 'mx-block';
    block.setAttribute('role', 'group');
    block.setAttribute('aria-label', `MIDI timeline: ${player.timeline.title}`);

    const headRow = document.createElement('div');
    headRow.className = 'mx-block-head';
    const title = document.createElement('span');
    title.textContent = 'MIDI timeline';
    const chip = document.createElement('span');
    chip.className = 'mx-block-id';
    chip.textContent = 'ADR-0020';
    headRow.append(title, chip);

    // Transport.
    const transport = document.createElement('div');
    transport.className = 'mx-row';
    const home = ledButton({ label: '⏮', title: 'To the start (Home)', onClick: () => player.seek(0) });
    const back = ledButton({ label: '◀ 1', title: 'One frame back (,)', onClick: () => player.step(-1) });
    this.playBtn = ledButton({ label: 'Play', tone: 'green', title: 'Play / pause (Space)', onClick: () => player.toggle() });
    const fwd = ledButton({ label: '1 ▶', title: 'One frame on (.)', onClick: () => player.step(1) });
    this.loopBtn = ledButton({ label: 'Loop', title: 'Wrap to the start at the end', onClick: () => player.setLoop(!player.loop) });
    this.time = document.createElement('span');
    this.time.className = 'mx-tl-time';
    this.act = document.createElement('span');
    this.act.className = 'mx-note mx-tl-act';
    transport.append(home.el, back.el, this.playBtn.el, fwd.el, this.loopBtn.el, this.time, this.act);

    // Lanes + playhead.
    this.lanes = document.createElement('div');
    this.lanes.className = 'mx-tl-lanes';
    this.lanes.style.setProperty('--mx-tl-h', `${MARKER_H + player.timeline.lanes.length * LANE_H + 4}px`);
    this.lanes.setAttribute('aria-hidden', 'true');
    this.canvas = document.createElement('canvas');
    this.head = document.createElement('div');
    this.head.className = 'mx-tl-head';
    this.lanes.append(this.canvas, this.head);
    const seekAt = (e: PointerEvent): void => {
      const rect = this.lanes!.getBoundingClientRect();
      const r = rect.width ? (e.clientX - rect.left) / rect.width : 0;
      player.seek(r * (player.timeline.length - 1));
    };
    let scrubbing = false;
    this.lanes.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      scrubbing = true;
      this.lanes!.setPointerCapture(e.pointerId);
      seekAt(e);
    });
    this.lanes.addEventListener('pointermove', (e) => {
      if (scrubbing) seekAt(e);
    });
    const stop = (): void => {
      scrubbing = false;
    };
    this.lanes.addEventListener('pointerup', stop);
    this.lanes.addEventListener('pointercancel', stop);

    // Scrubber: the accessible twin of the lane strip.
    this.slider = createSlider({ min: 0, max: player.timeline.length - 1, step: 1, label: 'Timeline position' });
    this.slider.addEventListener('mx-input', (e) => player.seek((e as CustomEvent<number>).detail));

    // Files + live MIDI.
    const files = document.createElement('div');
    files.className = 'mx-row';
    const name = (): string => (this.options.fileName ?? player.timeline.title).replace(/[^a-z0-9]+/gi, '-').toLowerCase();
    const mid = ledButton({
      label: 'Export .mid', title: 'The compiled MIDI stream as a Standard MIDI File — open it in a DAW',
      onClick: () => download(`${name()}.mid`, 'audio/midi', writeSmf(player.timeline)),
    });
    const json = ledButton({
      label: 'Export .json', title: 'The timeline with its setups, markers and lanes',
      onClick: () => download(`${name()}.json`, 'application/json', JSON.stringify(player.timeline, null, 2)),
    });
    const picker = document.createElement('input');
    picker.type = 'file';
    picker.accept = '.mid,.midi,.json,audio/midi,application/json';
    picker.hidden = true;
    picker.addEventListener('change', () => {
      const file = picker.files && picker.files[0];
      picker.value = '';
      if (file) void this.importFile(file);
    });
    const open = ledButton({
      label: 'Import', title: 'A .mid clip (played against this timeline\'s setups) or a timeline .json',
      onClick: () => picker.click(),
    });
    files.append(mid.el, json.el, open.el, picker);
    if (this.options.midi) {
      this.recBtn = ledButton({
        label: 'Record', tone: 'red', title: 'Punch-in: what you play on MIDI replaces the touched lanes from here until you stop',
        onClick: () => (player.isRecording ? player.stopRecording() : player.record()),
      });
      this.followBtn = ledButton({
        label: 'Follow DAW', title: 'Follow MIDI transport (Start/Stop/Continue/Song Position/Clock) — turn on Sync for this port in the DAW',
        onClick: () => player.setFollow(!player.following),
      });
      files.append(this.recBtn.el, this.followBtn.el);
    }
    this.status = document.createElement('span');
    this.status.className = 'mx-note mx-tl-act';
    this.status.setAttribute('role', 'status');
    files.appendChild(this.status);

    block.append(headRow, transport, this.lanes, this.slider, files);
    this.appendChild(block);

    this.addEventListener('keydown', (e) => {
      const k = e.key;
      if (k === ' ' || k === 'Spacebar') player.toggle();
      else if (k === ',') player.step(-1);
      else if (k === '.') player.step(1);
      else if (k === 'Home' && e.target !== this.slider) player.seek(0);
      else if (k === 'End' && e.target !== this.slider) player.seek(player.timeline.length - 1);
      else return;
      // Space must not also reach the page (scroll) or a key binding (Auto Take).
      e.preventDefault();
      e.stopPropagation();
    });

    this.resize = new ResizeObserver(() => {
      this.drawn = null;
      this.refresh();
    });
    this.resize.observe(this.lanes);
  }

  private async importFile(file: File): Promise<void> {
    const player = this.player!;
    try {
      let next: MidiTimeline;
      if (/\.json$/i.test(file.name) || file.type === 'application/json') {
        next = JSON.parse(await file.text()) as MidiTimeline;
      } else {
        next = timelineFromSmf(new Uint8Array(await file.arrayBuffer()), player.timeline);
      }
      const problems = validateTimeline(next);
      if (problems.length) throw new Error(problems[0]!);
      player.load(next);
      this.build();
      this.refresh();
      this.say(`Loaded ${file.name}: ${next.lanes.length} lanes, ${next.length} frames`, false);
    } catch (error) {
      this.say(`${file.name}: ${error instanceof Error ? error.message : String(error)}`, true);
    }
  }

  private say(text: string, err: boolean): void {
    if (!this.status) return;
    this.status.textContent = text;
    this.status.setAttribute('data-err', String(err));
  }

  private refresh(): void {
    const player = this.player;
    if (!player || !this.slider || !this.time || !this.act || !this.head) return;
    if (this.drawn !== player.timeline) this.draw();
    const t = player.timeline;
    const pos = player.position;
    const marker = player.marker;
    const key = `${pos}|${player.playing}|${player.loop}|${player.isRecording}|${player.following}|${marker ? marker.label : ''}`;
    if (key === this.last) return;
    this.last = key;
    const seconds = (pos / 60).toFixed(2);
    this.time.textContent = `${frameText(pos)} · ${seconds} s`;
    this.act.textContent = marker ? marker.label : '';
    this.slider.setFromStore(pos);
    this.slider.setAttribute('aria-valuetext', `frame ${pos} of ${t.length - 1}, ${seconds} seconds${marker ? `, ${marker.label}` : ''}`);
    this.head.style.left = `${t.length > 1 ? (pos / (t.length - 1)) * 100 : 0}%`;
    this.playBtn!.set(player.playing ? 'on' : 'off');
    this.playBtn!.setLabel(player.playing ? 'Pause' : 'Play');
    this.loopBtn!.set(player.loop ? 'on' : 'off');
    this.recBtn?.set(player.isRecording ? 'blink' : 'off');
    this.followBtn?.set(player.following ? 'on' : 'off');
  }

  /** Paint the lane strip once per timeline/size (the playhead is a separate element). */
  private draw(): void {
    const canvas = this.canvas!;
    const player = this.player!;
    const t = player.timeline;
    this.drawn = t;
    this.lanes!.style.setProperty('--mx-tl-h', `${MARKER_H + t.lanes.length * LANE_H + 4}px`);
    this.slider!.max = t.length - 1;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.max(1, Math.round(canvas.clientWidth * dpr));
    const h = Math.max(1, Math.round(canvas.clientHeight * dpr));
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const amber = token(this, '--mx-amber', '#f2a23c');
    const green = token(this, '--mx-green', '#4fd08a');
    const dim = token(this, '--mx-label-dim', '#777');
    const line = token(this, '--mx-line', '#333');
    const text = token(this, '--mx-label-bright', '#ddd');
    const x = (frame: number): number => (t.length > 1 ? (frame / (t.length - 1)) * w : 0);
    ctx.clearRect(0, 0, w, h);
    ctx.font = `${8 * dpr}px system-ui, sans-serif`;
    ctx.textBaseline = 'middle';

    // Markers: a rule through every lane, the label in the top row, clipped to its act.
    const markers = t.markers.slice().sort((a, b) => a.at - b.at);
    markers.forEach((m, i) => {
      ctx.fillStyle = line;
      ctx.fillRect(Math.round(x(m.at)), 0, Math.max(1, dpr), h);
      const end = i + 1 < markers.length ? x(markers[i + 1]!.at) : w;
      ctx.save();
      ctx.beginPath();
      ctx.rect(x(m.at), 0, end - x(m.at) - 3 * dpr, MARKER_H * dpr);
      ctx.clip();
      ctx.fillStyle = dim;
      ctx.fillText(m.label, x(m.at) + 4 * dpr, (MARKER_H / 2) * dpr);
      ctx.restore();
    });

    t.lanes.forEach((lane, i) => {
      const top = (MARKER_H + i * LANE_H) * dpr;
      const lh = LANE_H * dpr;
      ctx.fillStyle = 'rgba(255,255,255,0.025)';
      if (i % 2 === 0) ctx.fillRect(0, top, w, lh);
      if (lane.kind === 'cc') {
        ctx.strokeStyle = amber;
        ctx.lineWidth = 1.25 * dpr;
        ctx.beginPath();
        let pen = false;
        for (let px = 0; px <= w; px += dpr) {
          const v = sampleCcLane(lane, Math.round((px / w) * (t.length - 1)));
          if (v === null) {
            pen = false;
            continue;
          }
          const y = top + lh - 3 * dpr - v * (lh - 6 * dpr);
          if (pen) ctx.lineTo(px, y);
          else ctx.moveTo(px, y);
          pen = true;
        }
        ctx.stroke();
      } else if (lane.kind === 'note') {
        ctx.fillStyle = text;
        for (const e of lane.events) ctx.fillRect(Math.round(x(e.at)), top + 3 * dpr, 2 * dpr, lh - 6 * dpr);
      } else {
        for (const e of lane.events) {
          const label = `PC ${e.program}`;
          const pw = ctx.measureText(label).width + 8 * dpr;
          ctx.fillStyle = 'rgba(79,208,138,0.18)';
          ctx.fillRect(x(e.at), top + 3 * dpr, pw, lh - 6 * dpr);
          ctx.fillStyle = green;
          ctx.fillText(label, x(e.at) + 4 * dpr, top + lh / 2);
        }
      }
      if (lane.label) {
        // On a backing at the right edge, so a curve passing under it stays legible.
        const tw = ctx.measureText(lane.label).width;
        ctx.fillStyle = 'rgba(0,0,0,0.6)';
        ctx.fillRect(w - tw - 10 * dpr, top + 2 * dpr, tw + 10 * dpr, lh - 4 * dpr);
        ctx.fillStyle = dim;
        ctx.fillText(lane.label, w - tw - 5 * dpr, top + lh / 2);
      }
    });
  }
}

let defined = false;

/** Define the element (once) and return an attached instance. */
export function createTimelineView(player: TimelinePlayer, options: TimelineViewOptions = {}): MxTimeline {
  if (!defined) {
    if (!customElements.get('mx-timeline')) customElements.define('mx-timeline', MxTimeline);
    defined = true;
  }
  const view = document.createElement('mx-timeline') as MxTimeline;
  view.attach(player, options);
  return view;
}
