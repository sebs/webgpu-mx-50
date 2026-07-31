// The operator console (ADR-0013, styled per docs/STYLEGUIDE.md): the hardware's
// control blocks — Source Selection (B-1), Matte (B-2), Audio (B-3), Colour Correction
// (B-4), Positioner (B-5), Digital Effect (C), Mix/Wipe (D) with the T-bar lever,
// DSK, Fade, Event Memory and Special Modes — laid out as one console plate.
//
// Same contract as the strip it replaces: a stateless view of the single store
// (ADR-0011). Every control reads the snapshot through one refresh list and mutates
// only by dispatching typed commands; the render loop is never touched (ADR-0012).

import { ensureTheme } from './theme.js';
import { createSlider } from './primitives/slider.js';
import { createFader } from './primitives/fader.js';
import { createTbar } from './primitives/tbar.js';
import { createJoystick } from './primitives/joystick.js';
import { matteColorName, MATTE_PALETTE } from '../core/matte.js';
import { dskEdgeStyleLabel } from '../core/dsk.js';
import { AV_SYNCHRO_EFFECTS } from '../core/av-synchro.js';
import { SPECIAL_MACROS } from '../core/special-mode.js';
import type { MxSlider } from './primitives/slider.js';
import type { PanelStore } from '../state/store.js';
import type { BusId, BusSource } from '../core/types.js';
import type {
  BusState, DskFill, DskKeySource, FadeElement, FadeTarget, FilterEffect, MicAux2Input,
  PanelState, ProgramOut, WipeFamily,
} from '../state/state.js';

type LedState = 'off' | 'on' | 'blink' | 'blinkfast';
type LedTone = 'amber' | 'red' | 'green';

interface LedButton {
  el: HTMLButtonElement;
  set(state: LedState): void;
  setTone(tone: LedTone): void;
  setLabel(text: string): void;
}

interface LedButtonOptions {
  label: string;
  tone?: LedTone;
  shape?: 'dot' | 'bar' | 'minibar';
  stack?: boolean;
  wide?: boolean;
  title?: string;
  mono?: boolean;
  onClick: () => void;
}

function ledButton(options: LedButtonOptions): LedButton {
  const el = document.createElement('button');
  el.type = 'button';
  el.className = 'mxled' + (options.stack ? ' stack' : '') + (options.wide ? ' mx-wide' : '');
  el.setAttribute('data-tone', options.tone ?? 'amber');
  el.setAttribute('data-state', 'off');
  el.setAttribute('aria-pressed', 'false');
  if (options.title) el.title = options.title;
  const led = document.createElement('span');
  led.className = 'led';
  led.setAttribute('data-shape', options.shape ?? 'dot');
  const text = document.createElement('span');
  text.textContent = options.label;
  if (options.mono) text.style.font = '500 9px/1 var(--mx-mono)';
  el.append(led, text);
  el.addEventListener('click', options.onClick);
  return {
    el,
    set: (state) => {
      el.setAttribute('data-state', state);
      el.setAttribute('aria-pressed', String(state !== 'off'));
    },
    setTone: (tone) => el.setAttribute('data-tone', tone),
    setLabel: (t) => (text.textContent = t),
  };
}

/** Swatch backgrounds for the 9 Matte colours, index-aligned with MATTE_PALETTE. */
const MATTE_SWATCHES = [
  'linear-gradient(90deg,#c8c8c8,#c8c832,#32c8c8,#32c832,#c832c8,#c83232,#3232c8,#141414)',
  '#e6e6ea', '#d8c94a', '#4fc4d0', '#4fb26a', '#c057b0', '#c8453f', '#3f6fc8', '#141620',
];

/** The pattern matrix: 7 families × 4 representative variant glyphs (styleguide clip-paths). */
const WIPE_MATRIX: { family: WipeFamily; name: string; clips: string[] }[] = [
  { family: 'straight', name: 'Straight', clips: ['inset(0 50% 0 0)', 'inset(0 0 0 50%)', 'inset(0 0 50% 0)', 'inset(50% 0 0 0)'] },
  { family: 'corner', name: 'Corner', clips: ['inset(0 50% 50% 0)', 'inset(0 0 50% 50%)', 'inset(50% 50% 0 0)', 'inset(50% 0 0 50%)'] },
  { family: 'diagonal', name: 'Diagonal', clips: ['polygon(0 0,100% 0,0 100%)', 'polygon(100% 0,100% 100%,0 0)', 'polygon(0 100%,100% 100%,100% 0)', 'polygon(0 0,0 100%,100% 100%)'] },
  { family: 'triangle', name: 'Triangle', clips: ['polygon(0 0,100% 0,50% 70%)', 'polygon(0 100%,100% 100%,50% 30%)', 'polygon(0 0,0 100%,70% 50%)', 'polygon(100% 0,100% 100%,30% 50%)'] },
  { family: 'split', name: 'Split', clips: ['inset(0 34% 0 34%)', 'inset(34% 0 34% 0)', 'polygon(34% 0,66% 0,66% 34%,100% 34%,100% 66%,66% 66%,66% 100%,34% 100%,34% 66%,0 66%,0 34%,34% 34%)', 'inset(0 20% 0 20%)'] },
  { family: 'mosaic', name: 'Mosaic', clips: ['polygon(0 0,40% 0,40% 33%,70% 33%,70% 66%,100% 66%,100% 100%,0 100%)', 'polygon(0 0,100% 0,100% 40%,66% 40%,66% 70%,33% 70%,33% 100%,0 100%)', 'polygon(0 0,25% 0,25% 50%,50% 50%,50% 25%,75% 25%,75% 75%,100% 75%,100% 100%,0 100%)', 'inset(0 40% 0 0)'] },
  { family: 'square', name: 'Square', clips: ['inset(26% 26%)', 'circle(30% at 50% 50%)', 'ellipse(38% 22% at 50% 50%)', 'polygon(50% 12%,88% 50%,50% 88%,12% 50%)'] },
];

const SOURCE_CHOICES: { label: string; value: BusSource }[] = [
  { label: '1', value: 1 }, { label: '2', value: 2 }, { label: '3', value: 3 }, { label: '4', value: 4 },
  { label: 'Matte', value: 'matte' },
];

function pad3(n: number): string {
  return n < 10 ? `00${n}` : n < 100 ? `0${n}` : String(n);
}

function pct(v: number): string {
  return `${Math.round(v * 100)}%`;
}

export class MxConsole extends HTMLElement {
  private store: PanelStore | null = null;
  private unsubscribe: (() => void) | null = null;
  private readonly refresh: Array<(state: PanelState) => void> = [];
  private tickNow: () => number = () => 0;

  bind(store: PanelStore, tickNow: () => number = () => 0): void {
    this.store = store;
    this.tickNow = tickNow;
    if (this.isConnected) this.build();
  }

  connectedCallback(): void {
    if (this.store) this.build();
  }

  disconnectedCallback(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
  }

  private build(): void {
    const store = this.store;
    if (!store) return;
    ensureTheme();
    this.textContent = '';
    this.refresh.length = 0;

    const scroll = document.createElement('div');
    scroll.className = 'mx-plate-scroll';
    const plate = document.createElement('div');
    plate.className = 'mx-plate';
    scroll.appendChild(plate);

    plate.appendChild(this.place(this.buildSources(store), '1', '1'));
    plate.appendChild(this.place(this.buildMatte(store), '2', '1'));
    plate.appendChild(this.place(this.buildColourCorrect(store), '3', '1'));
    plate.appendChild(this.place(this.buildPositioner(store), '4', '1'));
    plate.appendChild(this.place(this.buildMixWipe(store), '5', '1 / span 4'));
    plate.appendChild(this.place(this.buildDigitalEffect(store), '1 / span 2', '2'));
    plate.appendChild(this.place(this.buildFreezeAndSynchro(store), '3 / span 2', '2'));
    plate.appendChild(this.place(this.buildAudio(store), '1', '3'));
    plate.appendChild(this.place(this.buildDsk(store), '2 / span 2', '3'));
    plate.appendChild(this.place(this.buildFade(store), '4', '3'));
    plate.appendChild(this.place(this.buildMemory(store), '1 / span 4', '4'));

    const foot = document.createElement('div');
    foot.className = 'mx-foot';
    const hints = [
      'Lever: drag, or ↑↓ (shift = fine). Auto Take glides it; press again to pause.',
      'Colour-correct button cycles blink → solid → off, as on the hardware.',
      'Matte on a bus + direct-out A/B → the substitute source button blinks.',
    ];
    for (const hint of hints) {
      const span = document.createElement('span');
      span.textContent = hint;
      foot.appendChild(span);
    }

    this.append(scroll, foot);

    this.unsubscribe?.();
    this.unsubscribe = store.subscribe((next) => this.reflect(next));
    this.reflect(store.getSnapshot());
  }

  private reflect(state: PanelState): void {
    for (const fn of this.refresh) fn(state);
  }

  private place(block: HTMLElement, column: string, row: string): HTMLElement {
    block.style.gridColumn = column;
    block.style.gridRow = row;
    return block;
  }

  private block(title: string, id: string): { el: HTMLElement; body: (child: HTMLElement) => void } {
    const el = document.createElement('section');
    el.className = 'mx-block';
    el.setAttribute('role', 'group');
    el.setAttribute('aria-label', title);
    const head = document.createElement('div');
    head.className = 'mx-block-head';
    const name = document.createElement('span');
    name.textContent = title;
    const chip = document.createElement('span');
    chip.className = 'mx-block-id';
    chip.textContent = id;
    head.append(name, chip);
    el.appendChild(head);
    return { el, body: (child) => el.appendChild(child) };
  }

  private grid(columns: number, tight = false): HTMLElement {
    const el = document.createElement('div');
    el.className = 'mx-grid' + (tight ? ' tight' : '');
    el.style.gridTemplateColumns = `repeat(${columns}, 1fr)`;
    return el;
  }

  private sliderRow(
    label: string,
    slider: MxSlider,
    format: ((state: PanelState) => string) | null,
    labelWidth?: number,
  ): { row: HTMLElement; value: HTMLElement } {
    const row = document.createElement('div');
    row.className = 'mx-srow';
    const name = document.createElement('span');
    name.className = 'slabel';
    if (labelWidth !== undefined) name.style.width = `${labelWidth}px`;
    name.textContent = label;
    row.append(name, slider);
    const value = document.createElement('span');
    value.className = 'svalue';
    if (format) {
      row.appendChild(value);
      this.refresh.push((s) => (value.textContent = format(s)));
    }
    return { row, value };
  }

  // ---- B-1 Source selection + Program Out ----
  private buildSources(store: PanelStore): HTMLElement {
    const { el, body } = this.block('Source selection', 'B-1');

    const note = document.createElement('span');
    note.className = 'mx-note';

    for (const bus of ['A', 'B'] as BusId[]) {
      const row = document.createElement('div');
      row.className = 'mx-row';
      const busLabel = document.createElement('span');
      busLabel.style.cssText = 'width:12px;font:500 10px/1 var(--mx-font);color:var(--mx-label-bright)';
      busLabel.textContent = bus;
      const grid = this.grid(5);
      grid.style.flex = '1';
      for (const choice of SOURCE_CHOICES) {
        const button = ledButton({
          label: choice.label, shape: 'bar', stack: true,
          title: `${bus}-bus: ${choice.value === 'matte' ? 'internal Matte' : `Source ${choice.label}`}`,
          onClick: () => store.dispatch({ type: 'ASSIGN_SOURCE', bus, source: choice.value }),
        });
        this.refresh.push((s) => {
          const busState: BusState = bus === 'A' ? s.busA : s.busB;
          const selected = busState.source === choice.value;
          const substitute =
            busState.source === 'matte' && s.programOut === bus && choice.value === busState.substituteSource;
          button.set(substitute ? 'blink' : selected ? 'on' : 'off');
        });
        grid.appendChild(button.el);
      }
      row.append(busLabel, grid);
      body(row);
    }

    const programRow = document.createElement('div');
    programRow.className = 'mx-row mx-sep';
    const programLabel = document.createElement('span');
    programLabel.className = 'mx-note';
    programLabel.style.width = '60px';
    programLabel.textContent = 'Program out';
    const programGrid = this.grid(3);
    programGrid.style.flex = '1';
    const programChoices: { label: string; value: ProgramOut }[] = [
      { label: 'A', value: 'A' }, { label: 'B', value: 'B' }, { label: 'Effect', value: 'effect' },
    ];
    for (const choice of programChoices) {
      const button = ledButton({
        label: choice.label, tone: 'red',
        onClick: () => store.dispatch({ type: 'SET_PROGRAM_OUT', mode: choice.value }),
      });
      this.refresh.push((s) => button.set(s.programOut === choice.value ? 'on' : 'off'));
      programGrid.appendChild(button.el);
    }
    programRow.append(programLabel, programGrid);
    body(programRow);

    this.refresh.push((s) => {
      const direct = s.programOut === 'A' || s.programOut === 'B';
      const busState = s.programOut === 'A' ? s.busA : s.busB;
      note.textContent =
        direct && busState.source === 'matte'
          ? `Matte is never sent direct — source ${busState.substituteSource} substitutes on ${s.programOut}`
          : 'Direct A/B bypasses every effect stage';
    });
    body(note);
    return el;
  }

  // ---- B-2 Matte ----
  private buildMatte(store: PanelStore): HTMLElement {
    const { el, body } = this.block('Matte', 'B-2');

    const swatch = document.createElement('div');
    swatch.className = 'mx-swatch';
    this.refresh.push((s) => {
      const wrapped = ((s.matte.colorIndex % MATTE_PALETTE.length) + MATTE_PALETTE.length) % MATTE_PALETTE.length;
      swatch.style.background = MATTE_SWATCHES[wrapped] ?? '#000';
      swatch.style.opacity = String(0.35 + 0.65 * s.matte.level);
    });
    body(swatch);

    const stepRow = document.createElement('div');
    stepRow.className = 'mx-row';
    const down = document.createElement('button');
    down.type = 'button';
    down.className = 'mx-stepbtn';
    down.textContent = '∨';
    down.setAttribute('aria-label', 'Matte colour down');
    down.addEventListener('click', () => store.dispatch({ type: 'STEP_MATTE_COLOR', direction: 'down' }));
    const name = document.createElement('span');
    name.className = 'mx-stepname';
    this.refresh.push((s) => (name.textContent = matteColorName(s.matte.colorIndex)));
    const up = document.createElement('button');
    up.type = 'button';
    up.className = 'mx-stepbtn';
    up.textContent = '∧';
    up.setAttribute('aria-label', 'Matte colour up');
    up.addEventListener('click', () => store.dispatch({ type: 'STEP_MATTE_COLOR', direction: 'up' }));
    stepRow.append(down, name, up);
    body(stepRow);

    const level = createSlider({ label: 'Matte level' });
    level.addEventListener('mx-input', (e) =>
      store.dispatch({ type: 'SET_MATTE_LEVEL', level: (e as CustomEvent<number>).detail }),
    );
    this.refresh.push((s) => level.setFromStore(s.matte.level));
    body(this.sliderRow('Level', level, null, 34).row);

    const gradation = ledButton({
      label: 'Gradation',
      onClick: () => store.dispatch({ type: 'SET_GRADATION', on: !store.getSnapshot().matte.gradation }),
    });
    this.refresh.push((s) => gradation.set(s.matte.gradation ? 'on' : 'off'));
    body(gradation.el);
    return el;
  }

  // ---- B-4 Colour correction ----
  private buildColourCorrect(store: PanelStore): HTMLElement {
    const { el, body } = this.block('Colour corr', 'B-4');

    const buttons = this.grid(2);
    for (const bus of ['A', 'B'] as BusId[]) {
      const button = ledButton({
        label: `CC ${bus}`,
        title: 'Cycles: off → CHROMA (blink) → +RGB joystick (solid) → off',
        onClick: () => store.dispatch({ type: 'PRESS_COLOUR_CORRECT', bus }),
      });
      this.refresh.push((s) => {
        const mode = (bus === 'A' ? s.busA : s.busB).colourCorrect.mode;
        button.set(mode === 'chroma-plus-joystick' ? 'on' : mode === 'chroma-only' ? 'blink' : 'off');
      });
      buttons.appendChild(button.el);
    }
    body(buttons);

    // One physical RGB joystick: it drives every bus whose CC mode has the joystick
    // active (reference §6), and reflects the first such bus.
    const stick = createJoystick('knob', 'RGB colour correction joystick');
    stick.addEventListener('mx-move', (e) => {
      const { x, y } = (e as CustomEvent<{ x: number; y: number }>).detail;
      const s = store.getSnapshot();
      for (const bus of ['A', 'B'] as BusId[]) {
        if ((bus === 'A' ? s.busA : s.busB).colourCorrect.mode === 'chroma-plus-joystick') {
          store.dispatch({ type: 'SET_CC_JOYSTICK', bus, x, y });
        }
      }
    });
    this.refresh.push((s) => {
      const active = s.busA.colourCorrect.mode === 'chroma-plus-joystick' ? s.busA
        : s.busB.colourCorrect.mode === 'chroma-plus-joystick' ? s.busB : null;
      stick.disabled = active === null;
      if (active) stick.setFromStore(active.colourCorrect.joystickX, active.colourCorrect.joystickY);
    });
    body(stick);

    for (const bus of ['A', 'B'] as BusId[]) {
      const chroma = createSlider({ label: `${bus}-bus CHROMA` });
      chroma.addEventListener('mx-input', (e) =>
        store.dispatch({ type: 'SET_CHROMA', bus, value: (e as CustomEvent<number>).detail }),
      );
      this.refresh.push((s) => chroma.setFromStore((bus === 'A' ? s.busA : s.busB).colourCorrect.chroma));
      body(this.sliderRow(`Chroma ${bus}`, chroma, null, 44).row);
    }
    return el;
  }

  // ---- B-5 Positioner ----
  private buildPositioner(store: PanelStore): HTMLElement {
    const { el, body } = this.block('Positioner', 'B-5');

    const pad = createJoystick('frame', 'Positioner joystick');
    pad.addEventListener('mx-move', (e) => {
      const { x, y } = (e as CustomEvent<{ x: number; y: number }>).detail;
      store.dispatch({ type: 'SET_POSITIONER_JOYSTICK', x, y });
    });
    this.refresh.push((s) => {
      pad.disabled = !s.positioner.on;
      pad.setFromStore(s.positioner.x, s.positioner.y);
      pad.setFrameSize(s.positioner.size);
    });
    body(pad);

    const size = createSlider({ label: 'Positioner inset size' });
    size.addEventListener('mx-input', (e) =>
      store.dispatch({ type: 'SET_POSITIONER_SIZE', value: (e as CustomEvent<number>).detail }),
    );
    this.refresh.push((s) => size.setFromStore(s.positioner.size));
    body(this.sliderRow('Size', size, null, 30).row);

    const on = ledButton({
      label: 'Positioner on',
      title: 'Square-family wipes only; doubles the wiped size (reference §7)',
      onClick: () => store.dispatch({ type: 'PRESS_POSITIONER' }),
    });
    this.refresh.push((s) => on.set(s.positioner.on ? 'on' : 'off'));
    const grab = ledButton({
      label: 'Scene grabber',
      title: 'Freezes the image inside the wipe inset; the joystick then moves the still',
      onClick: () => store.dispatch({ type: 'PRESS_SCENE_GRABBER' }),
    });
    this.refresh.push((s) => grab.set(s.positioner.sceneGrabber ? 'on' : 'off'));
    const col = document.createElement('div');
    col.style.cssText = 'display:flex;flex-direction:column;gap:6px';
    col.append(on.el, grab.el);
    body(col);
    return el;
  }

  // ---- D Mix / Wipe + the lever column ----
  private buildMixWipe(store: PanelStore): HTMLElement {
    const { el } = this.block('Mix / wipe', 'D');
    el.style.flexDirection = 'row';
    el.style.gap = '12px';
    // Rebuild the block as a two-column body under the header the block() helper made.
    const head = el.firstElementChild as HTMLElement;
    el.textContent = '';
    const left = document.createElement('div');
    left.style.cssText = 'flex:1;display:flex;flex-direction:column;gap:9px;min-width:0';
    left.appendChild(head);

    // Transition selector: Mix, NAM, Wipe, and the two key modes (reference §9).
    const transitions = this.grid(5, true);
    const transitionButtons: { label: string; is: (s: PanelState) => boolean; press: () => void }[] = [
      { label: 'Mix', is: (s) => s.transition.type === 'mix', press: () => store.dispatch({ type: 'SET_TRANSITION_TYPE', transition: 'mix' }) },
      { label: 'NAM', is: (s) => s.transition.type === 'nam', press: () => store.dispatch({ type: 'SET_TRANSITION_TYPE', transition: 'nam' }) },
      { label: 'Wipe', is: (s) => s.transition.type === 'wipe', press: () => store.dispatch({ type: 'SET_TRANSITION_TYPE', transition: 'wipe' }) },
      { label: 'Lum key', is: (s) => s.transition.type === 'lum-key', press: () => store.dispatch({ type: 'PRESS_LUM_KEY' }) },
      { label: 'Chroma', is: (s) => s.transition.type === 'chroma-key', press: () => store.dispatch({ type: 'PRESS_CHROMA_KEY' }) },
    ];
    for (const t of transitionButtons) {
      const button = ledButton({ label: t.label, shape: 'bar', stack: true, onClick: t.press });
      this.refresh.push((s) => button.set(t.is(s) ? 'on' : 'off'));
      transitions.appendChild(button.el);
    }
    left.appendChild(transitions);

    // The pattern matrix (reference §9.4): 7 families × 4 variants.
    const matrix = document.createElement('div');
    matrix.setAttribute('role', 'grid');
    matrix.setAttribute('aria-label', 'Wipe pattern matrix');
    matrix.style.cssText = 'display:flex;flex-direction:column;gap:5px';
    WIPE_MATRIX.forEach((entry, familyIndex) => {
      const row = document.createElement('div');
      row.className = 'mx-pat-row';
      row.setAttribute('role', 'row');
      const fam = document.createElement('span');
      fam.className = 'fam';
      fam.textContent = entry.name;
      this.refresh.push((s) => fam.setAttribute('data-active', String(s.transition.wipe.family === entry.family)));
      const cells = document.createElement('div');
      cells.className = 'mx-pat-cells';
      entry.clips.forEach((clip, variant) => {
        const cell = document.createElement('button');
        cell.type = 'button';
        cell.className = 'mx-pat-cell';
        cell.setAttribute('role', 'gridcell');
        cell.setAttribute('aria-label', `${entry.name} wipe, variant ${variant + 1} (pattern ${pad3(familyIndex * 4 + variant + 1)})`);
        const shape = document.createElement('span');
        shape.className = 'shape';
        shape.style.clipPath = clip;
        cell.appendChild(shape);
        cell.addEventListener('click', () => {
          if (store.getSnapshot().transition.wipe.family !== entry.family) {
            store.dispatch({ type: 'PRESS_WIPE_FAMILY', family: entry.family });
          }
          store.dispatch({ type: 'SET_WIPE_VARIANT', variant });
        });
        this.refresh.push((s) =>
          cell.setAttribute(
            'aria-pressed',
            String(s.transition.wipe.family === entry.family && s.transition.wipe.variant === variant),
          ),
        );
        cells.appendChild(cell);
      });
      row.append(fam, cells);
      matrix.appendChild(row);
    });
    left.appendChild(matrix);

    // Modifier row (reference §9.4): Compression, Slide, Multi, Pairing, Blinds.
    const modifiers = this.grid(5, true);
    const compression = ledButton({
      label: 'Compr', shape: 'minibar', stack: true, title: '1× incoming compressed · 2× both compressed',
      onClick: () => store.dispatch({ type: 'PRESS_COMPRESSION' }),
    });
    this.refresh.push((s) => {
      const level = s.transition.wipe.modifiers.compression;
      compression.set(level === 2 ? 'blink' : level === 1 ? 'on' : 'off');
    });
    const slide = ledButton({
      label: 'Slide', shape: 'minibar', stack: true, title: '1× one image slides · 2× both slide',
      onClick: () => store.dispatch({ type: 'PRESS_SLIDE' }),
    });
    this.refresh.push((s) => {
      const level = s.transition.wipe.modifiers.slide;
      slide.set(level === 2 ? 'blink' : level === 1 ? 'on' : 'off');
    });
    const multi = ledButton({
      label: 'Multi', shape: 'minibar', stack: true, title: 'Repeats the pattern — 6 multi modes',
      onClick: () => store.dispatch({ type: 'PRESS_WIPE_MULTI' }),
    });
    this.refresh.push((s) => {
      const mode = s.transition.wipe.modifiers.multi;
      multi.set(mode > 0 ? 'on' : 'off');
      multi.setLabel(mode > 0 ? `Multi ${mode}` : 'Multi');
    });
    const pairing = ledButton({
      label: 'Pair', shape: 'minibar', stack: true, title: 'Paired / mirrored wipe',
      onClick: () => store.dispatch({ type: 'SET_PAIRING', on: !store.getSnapshot().transition.wipe.modifiers.pairing }),
    });
    this.refresh.push((s) => pairing.set(s.transition.wipe.modifiers.pairing ? 'on' : 'off'));
    const blinds = ledButton({
      label: 'Blinds', shape: 'minibar', stack: true, title: 'Venetian-blind strips',
      onClick: () => store.dispatch({ type: 'SET_BLINDS', on: !store.getSnapshot().transition.wipe.modifiers.blinds }),
    });
    this.refresh.push((s) => blinds.set(s.transition.wipe.modifiers.blinds ? 'on' : 'off'));
    modifiers.append(compression.el, slide.el, multi.el, pairing.el, blinds.el);
    left.appendChild(modifiers);

    // Edge + direction row: Border, Soft, Reverse, One-way, Aspect ON.
    const edges = this.grid(5, true);
    const border = ledButton({
      label: 'Border', shape: 'minibar', stack: true, title: 'Cycles narrow → wide → off',
      onClick: () => store.dispatch({ type: 'PRESS_BORDER' }),
    });
    this.refresh.push((s) => {
      const edge = s.transition.wipe.edge;
      border.set(edge === 'border-wide' ? 'blink' : edge === 'border-narrow' ? 'on' : 'off');
    });
    const soft = ledButton({
      label: 'Soft', shape: 'minibar', stack: true, title: 'Soft edge, narrow ↔ wide',
      onClick: () => store.dispatch({ type: 'PRESS_SOFT' }),
    });
    this.refresh.push((s) => {
      const edge = s.transition.wipe.edge;
      soft.set(edge === 'soft-wide' ? 'blink' : edge === 'soft-narrow' ? 'on' : 'off');
    });
    const reverse = ledButton({
      label: 'Reverse', shape: 'minibar', stack: true,
      onClick: () => store.dispatch({ type: 'SET_REVERSE', on: !store.getSnapshot().transition.wipe.reverse }),
    });
    this.refresh.push((s) => reverse.set(s.transition.wipe.reverse ? 'on' : 'off'));
    const oneWay = ledButton({
      label: 'One-way', shape: 'minibar', stack: true, title: 'The wipe travels the same direction every swing',
      onClick: () => store.dispatch({ type: 'SET_ONE_WAY', on: !store.getSnapshot().transition.wipe.oneWay }),
    });
    this.refresh.push((s) => oneWay.set(s.transition.wipe.oneWay ? 'on' : 'off'));
    const aspectOn = ledButton({
      label: 'Aspect', shape: 'minibar', stack: true, title: 'ASPECT ON (Square family, reference §7)',
      onClick: () => store.dispatch({ type: 'SET_ASPECT_ON', on: !store.getSnapshot().transition.wipe.aspectOn }),
    });
    this.refresh.push((s) => aspectOn.set(s.transition.wipe.aspectOn ? 'on' : 'off'));
    edges.append(border.el, soft.el, reverse.el, oneWay.el, aspectOn.el);
    left.appendChild(edges);

    // Shared key/wipe levels: SLICE, HUE, and the Square-family aspect.
    const slice = createSlider({ label: 'Key SLICE' });
    slice.addEventListener('mx-input', (e) => store.dispatch({ type: 'SET_SLICE', value: (e as CustomEvent<number>).detail }));
    this.refresh.push((s) => slice.setFromStore(s.transition.slice));
    left.appendChild(this.sliderRow('Slice', slice, (s) => pct(s.transition.slice), 60).row);

    const hue = createSlider({ label: 'Chroma key HUE' });
    hue.addEventListener('mx-input', (e) => store.dispatch({ type: 'SET_HUE', angle: (e as CustomEvent<number>).detail }));
    this.refresh.push((s) => hue.setFromStore(s.transition.hue));
    left.appendChild(this.sliderRow('Hue', hue, (s) => `${Math.round(s.transition.hue * 360)}°`, 60).row);

    const aspect = createSlider({ label: 'Wipe aspect (Square family)', min: -1, max: 1 });
    aspect.addEventListener('mx-input', (e) => store.dispatch({ type: 'SET_WIPE_ASPECT', value: (e as CustomEvent<number>).detail }));
    this.refresh.push((s) => aspect.setFromStore(s.transition.wipe.aspect));
    left.appendChild(this.sliderRow('Aspect', aspect, (s) => s.transition.wipe.aspect.toFixed(2), 60).row);

    // Pattern readout.
    const read = document.createElement('div');
    read.className = 'mx-read';
    const readLabel = document.createElement('span');
    readLabel.className = 'rlabel';
    readLabel.textContent = 'Pattern';
    const readValue = document.createElement('span');
    readValue.className = 'rvalue';
    const readEdge = document.createElement('span');
    readEdge.className = 'rlabel';
    this.refresh.push((s) => {
      let familyIndex = 0;
      for (let i = 0; i < WIPE_MATRIX.length; i++) {
        if (WIPE_MATRIX[i]!.family === s.transition.wipe.family) familyIndex = i;
      }
      readValue.textContent = pad3(familyIndex * 4 + s.transition.wipe.variant + 1);
      readEdge.textContent = s.transition.wipe.edge;
    });
    read.append(readLabel, readValue, readEdge);
    left.appendChild(read);

    // Lever column: bus LEDs, the T-bar, AUTO TAKE, and the TRANSITION time.
    const divider = document.createElement('div');
    divider.className = 'mx-vdivider';

    const right = document.createElement('div');
    right.style.cssText = 'width:166px;flex:none;display:flex;flex-direction:column;align-items:center;gap:10px';

    const leverHead = document.createElement('div');
    leverHead.className = 'mx-block-head';
    leverHead.style.alignSelf = 'stretch';
    const leverTitle = document.createElement('span');
    leverTitle.textContent = 'Lever';
    const leverPct = document.createElement('span');
    leverPct.style.cssText = 'font:500 9px/1 var(--mx-mono);letter-spacing:0';
    this.refresh.push((s) => (leverPct.textContent = pct(s.transition.lever)));
    leverHead.append(leverTitle, leverPct);
    right.appendChild(leverHead);

    const leverRow = document.createElement('div');
    leverRow.style.cssText = 'display:flex;gap:14px;align-items:stretch';
    const ledCol = document.createElement('div');
    ledCol.style.cssText = 'display:flex;flex-direction:column;justify-content:space-between;align-items:center;padding:2px 0';
    const makeBusLed = (label: string): { wrap: HTMLElement; led: HTMLElement } => {
      const wrap = document.createElement('div');
      wrap.style.cssText = 'display:flex;flex-direction:column;align-items:center;gap:5px';
      const led = document.createElement('span');
      led.className = 'mx-busled';
      const text = document.createElement('span');
      text.style.cssText = 'font:500 10px/1 var(--mx-font);letter-spacing:.12em;color:var(--mx-label-bright)';
      text.textContent = label;
      if (label === 'A') wrap.append(led, text);
      else wrap.append(text, led);
      return { wrap, led };
    };
    const aLed = makeBusLed('A');
    const bLed = makeBusLed('B');
    ledCol.append(aLed.wrap, bLed.wrap);
    this.refresh.push((s) => {
      aLed.led.setAttribute('data-on', String(s.transition.lever <= 0.02));
      bLed.led.setAttribute('data-on', String(s.transition.lever >= 0.98));
    });

    const tbar = createTbar('Mix/Wipe lever, A to B');
    tbar.addEventListener('mx-input', (e) => store.dispatch({ type: 'SET_LEVER', position: (e as CustomEvent<number>).detail }));
    this.refresh.push((s) => tbar.setFromStore(s.transition.lever));
    leverRow.append(ledCol, tbar);
    right.appendChild(leverRow);

    const autoTake = ledButton({
      label: 'Auto take', wide: true, shape: 'dot',
      title: 'Runs the transition over the TRANSITION time; press again to pause/resume',
      onClick: () => store.dispatch({ type: 'PRESS_AUTO_TAKE', tick: this.tickNow() }),
    });
    this.refresh.push((s) =>
      autoTake.set(s.transition.auto.phase === 'running' ? 'on' : s.transition.auto.phase === 'paused' ? 'blink' : 'off'),
    );
    right.appendChild(autoTake.el);

    const timeWrap = document.createElement('div');
    timeWrap.style.cssText = 'align-self:stretch;display:flex;flex-direction:column;gap:6px';
    const frames = createSlider({ label: 'TRANSITION time in frames', min: 0, max: 510, step: 2 });
    frames.addEventListener('mx-input', (e) => store.dispatch({ type: 'SET_TRANSITION_TIME', frames: (e as CustomEvent<number>).detail }));
    this.refresh.push((s) => frames.setFromStore(s.transitionFrames));
    const timeRead = document.createElement('div');
    timeRead.className = 'mx-read';
    const timeLabel = document.createElement('span');
    timeLabel.className = 'rlabel';
    timeLabel.textContent = 'Transition';
    const timeValue = document.createElement('span');
    timeValue.className = 'rvalue small';
    this.refresh.push((s) => (timeValue.textContent = `${s.transitionFrames} f`));
    timeRead.append(timeLabel, timeValue);
    timeWrap.append(frames, timeRead);
    right.appendChild(timeWrap);

    el.append(left, divider, right);
    return el;
  }

  // ---- C Digital effect (filters) ----
  private buildDigitalEffect(store: PanelStore): HTMLElement {
    const { el, body } = this.block('Digital effect', 'C');

    const busRow = document.createElement('div');
    busRow.className = 'mx-row';
    const busLabel = document.createElement('span');
    busLabel.className = 'mx-note';
    busLabel.textContent = 'Bus';
    busRow.appendChild(busLabel);
    for (const bus of ['A', 'B'] as BusId[]) {
      const button = ledButton({ label: bus, onClick: () => store.dispatch({ type: 'SELECT_EFFECT_BUS', bus }) });
      button.el.style.padding = '7px 11px';
      this.refresh.push((s) => button.set(s.digitalEffect.bus === bus ? 'on' : 'off'));
      busRow.appendChild(button.el);
    }
    const spacer = document.createElement('div');
    spacer.style.flex = '1';
    const armedNote = document.createElement('span');
    armedNote.className = 'mx-note';
    this.refresh.push((s) => {
      armedNote.textContent = s.digitalEffect.armed ? `${s.digitalEffect.armed} armed — press ON` : '';
    });
    busRow.append(spacer, armedNote);
    body(busRow);

    const filters = this.grid(5);
    for (const effect of ['nega', 'mosaic', 'mono', 'paint'] as FilterEffect[]) {
      const button = ledButton({
        label: effect, shape: 'bar', stack: true,
        onClick: () => store.dispatch({ type: 'CHOOSE_EFFECT', effect }),
      });
      this.refresh.push((s) =>
        button.set(s.digitalEffect.active[effect] ? 'on' : s.digitalEffect.armed === effect ? 'blink' : 'off'),
      );
      filters.appendChild(button.el);
    }
    const on = ledButton({
      label: 'On', shape: 'bar', stack: true, tone: 'red',
      title: 'Applies the armed effect to the selected bus',
      onClick: () => store.dispatch({ type: 'PRESS_EFFECT_ON' }),
    });
    this.refresh.push((s) => {
      const anyActive =
        s.digitalEffect.active.nega || s.digitalEffect.active.mosaic || s.digitalEffect.active.mono || s.digitalEffect.active.paint;
      on.set(anyActive ? 'on' : 'off');
    });
    filters.appendChild(on.el);
    body(filters);

    const mosaic = createSlider({ label: 'Mosaic SIZE', min: 1, max: 31, step: 1 });
    mosaic.addEventListener('mx-input', (e) => store.dispatch({ type: 'SET_MOSAIC_SIZE', step: (e as CustomEvent<number>).detail }));
    this.refresh.push((s) => mosaic.setFromStore(s.digitalEffect.mosaicSize));
    body(this.sliderRow('Mosaic size', mosaic, (s) => String(s.digitalEffect.mosaicSize)).row);

    const paint = createSlider({ label: 'Paint LEVEL' });
    paint.addEventListener('mx-input', (e) => store.dispatch({ type: 'SET_PAINT_LEVEL', level: (e as CustomEvent<number>).detail }));
    this.refresh.push((s) => paint.setFromStore(s.digitalEffect.paintLevel));
    body(this.sliderRow('Paint level', paint, (s) => pct(s.digitalEffect.paintLevel)).row);
    return el;
  }

  // ---- C §8.5–8.10 Freeze family + A/V Synchro ----
  private buildFreezeAndSynchro(store: PanelStore): HTMLElement {
    const { el, body } = this.block('Freeze / frame', 'C · 8.5–8.10');

    const buttons = this.grid(5);
    const still = ledButton({
      label: 'Still', shape: 'bar', stack: true,
      onClick: () => store.dispatch({ type: 'ENGAGE_FREEZE', effect: 'still', on: !store.getSnapshot().digitalEffect.freeze.still }),
    });
    this.refresh.push((s) => still.set(s.digitalEffect.freeze.still ? 'on' : 'off'));
    const strobe = ledButton({
      label: 'Strobe', shape: 'bar', stack: true,
      onClick: () => store.dispatch({ type: 'ENGAGE_FREEZE', effect: 'strobe', on: !store.getSnapshot().digitalEffect.freeze.strobe }),
    });
    this.refresh.push((s) => strobe.set(s.digitalEffect.freeze.strobe ? 'on' : 'off'));
    const multi = ledButton({
      label: 'Multi', shape: 'bar', stack: true, title: 'Cycles single → 4 → 9 → 16',
      onClick: () => store.dispatch({ type: 'PRESS_MULTI' }),
    });
    this.refresh.push((s) => {
      multi.set(s.digitalEffect.freeze.multi > 0 ? 'on' : 'off');
      multi.setLabel(s.digitalEffect.freeze.multi > 0 ? `Multi ${s.digitalEffect.freeze.multi}` : 'Multi');
    });
    const trail = ledButton({
      label: 'Trail', shape: 'bar', stack: true,
      onClick: () => store.dispatch({ type: 'ENGAGE_FREEZE', effect: 'trail', on: !store.getSnapshot().digitalEffect.freeze.trail }),
    });
    this.refresh.push((s) => trail.set(s.digitalEffect.freeze.trail ? 'on' : 'off'));
    const frame = ledButton({
      label: 'Frame', shape: 'bar', stack: true,
      title: 'Field/frame mode — a remembered no-op in the clean-modern build (ADR-0005 §6)',
      onClick: () =>
        store.dispatch({ type: 'SET_FRAME_MODE', mode: store.getSnapshot().digitalEffect.frameMode === 'frame' ? 'field' : 'frame' }),
    });
    this.refresh.push((s) => frame.set(s.digitalEffect.frameMode === 'field' ? 'on' : 'off'));
    buttons.append(still.el, strobe.el, multi.el, trail.el, frame.el);
    body(buttons);

    const strobeTime = createSlider({ label: 'Strobe TIME' });
    strobeTime.addEventListener('mx-input', (e) => store.dispatch({ type: 'SET_STROBE_TIME', position: (e as CustomEvent<number>).detail }));
    this.refresh.push((s) => strobeTime.setFromStore(s.digitalEffect.strobeTime));
    body(this.sliderRow('Strobe time', strobeTime, (s) => pct(s.digitalEffect.strobeTime), 64).row);

    const avHead = document.createElement('div');
    avHead.className = 'mx-block-head mx-sep';
    const avTitle = document.createElement('span');
    avTitle.textContent = 'A/V synchro';
    const avRef = document.createElement('span');
    avRef.className = 'mx-block-id';
    avRef.textContent = '§8.9';
    avHead.append(avTitle, avRef);
    body(avHead);

    const avGrid = this.grid(4);
    const arm = ledButton({
      label: 'Arm', tone: 'red', title: 'Audio-gated effects: the selected effects pulse with the sound level',
      onClick: () => store.dispatch({ type: 'ATTEMPT_AV_SYNCHRO', on: !store.getSnapshot().digitalEffect.avSynchro }),
    });
    arm.el.classList.add('av-arm');
    this.refresh.push((s) => arm.set(s.digitalEffect.avSynchro ? 'on' : 'off'));
    avGrid.appendChild(arm.el);
    for (const effect of AV_SYNCHRO_EFFECTS) {
      const button = ledButton({
        label: effect,
        onClick: () =>
          store.dispatch({ type: 'SET_AV_SYNCHRO_EFFECT', effect, on: !store.getSnapshot().digitalEffect.avSynchroEffects[effect] }),
      });
      this.refresh.push((s) => button.set(s.digitalEffect.avSynchroEffects[effect] ? 'on' : 'off'));
      avGrid.appendChild(button.el);
    }
    body(avGrid);

    const avLevel = createSlider({ label: 'A/V Synchro LEVEL threshold' });
    avLevel.addEventListener('mx-input', (e) => store.dispatch({ type: 'SET_AV_SYNCHRO_LEVEL', level: (e as CustomEvent<number>).detail }));
    this.refresh.push((s) => avLevel.setFromStore(s.digitalEffect.avSynchroLevel));
    body(this.sliderRow('Level', avLevel, (s) => pct(s.digitalEffect.avSynchroLevel), 64).row);
    return el;
  }

  // ---- B-3 Audio mixer ----
  private buildAudio(store: PanelStore): HTMLElement {
    const { el, body } = this.block('Audio mixer', 'B-3');
    const channels: { key: 'a' | 'b' | 'aux1' | 'micAux2' | 'master'; label: string }[] = [
      { key: 'a', label: 'A' }, { key: 'b', label: 'B' }, { key: 'aux1', label: 'Aux1' },
      { key: 'micAux2', label: 'Mic/Aux2' }, { key: 'master', label: 'Master' },
    ];
    const grid = this.grid(5);
    grid.style.gap = '8px';
    for (const channel of channels) {
      const chan = document.createElement('div');
      chan.className = 'mx-chan';
      const pair = document.createElement('div');
      pair.style.cssText = 'display:flex;gap:5px;align-items:flex-end';
      const fader = createFader(`${channel.label} audio fader`);
      fader.addEventListener('mx-input', (e) =>
        store.dispatch({ type: 'SET_AUDIO_FADER', fader: channel.key, level: (e as CustomEvent<number>).detail }),
      );
      const meter = document.createElement('div');
      meter.className = 'mx-meter';
      const meterFill = document.createElement('div');
      meter.appendChild(meterFill);
      const label = document.createElement('span');
      label.className = 'clabel';
      label.textContent = channel.label;
      const value = document.createElement('span');
      value.className = 'cvalue';
      this.refresh.push((s) => {
        const level = s.audio.faders[channel.key];
        fader.setFromStore(level);
        // The meter shows the fader law's level — a live signal meter is a deferred
        // browser-only integration (docs/DEFERRED.md, real audio-input capture).
        meterFill.style.height = pct(level);
        value.textContent = pct(level);
      });
      pair.append(fader, meter);
      chan.append(pair, label, value);
      grid.appendChild(chan);
    }
    body(grid);

    const buttons = this.grid(3);
    buttons.className += ' mx-sep';
    for (const position of ['mic', 'aux2'] as MicAux2Input[]) {
      const button = ledButton({
        label: position === 'mic' ? 'Mic' : 'Aux2',
        title: 'Front-panel switch: what the Mic/Aux2 fader governs',
        onClick: () => store.dispatch({ type: 'SET_MIC_AUX2_SWITCH', position }),
      });
      this.refresh.push((s) => button.set(s.audio.micAux2 === position ? 'on' : 'off'));
      buttons.appendChild(button.el);
    }
    const follow = ledButton({
      label: 'Follow', tone: 'green',
      title: 'Audio Follow: equal-power crossfade tied to the Mix/Wipe lever',
      onClick: () => store.dispatch({ type: 'PRESS_AUDIO_FOLLOW' }),
    });
    this.refresh.push((s) => follow.set(s.audio.audioFollow ? 'on' : 'off'));
    buttons.appendChild(follow.el);
    body(buttons);
    return el;
  }

  // ---- Downstream key ----
  private buildDsk(store: PanelStore): HTMLElement {
    const { el, body } = this.block('Downstream key', 'E');

    const grid = this.grid(4);
    const dskOn = ledButton({
      label: 'DSK on', tone: 'red',
      onClick: () => store.dispatch({ type: 'SET_DSK_ON', on: !store.getSnapshot().dsk.on }),
    });
    this.refresh.push((s) => dskOn.set(s.dsk.on ? 'on' : 'off'));
    grid.appendChild(dskOn.el);
    for (const fill of ['white', 'matte'] as DskFill[]) {
      const button = ledButton({
        label: fill, title: 'Title fill',
        onClick: () => store.dispatch({ type: 'SET_DSK_FILL', fill }),
      });
      this.refresh.push((s) => button.set(s.dsk.fill === fill ? 'on' : 'off'));
      grid.appendChild(button.el);
    }
    const reverse = ledButton({ label: 'Reverse', onClick: () => store.dispatch({ type: 'PRESS_DSK_REVERSE' }) });
    this.refresh.push((s) => reverse.set(s.dsk.reverse ? 'on' : 'off'));
    grid.appendChild(reverse.el);
    for (const source of ['ext-camera', 'A', 'B'] as DskKeySource[]) {
      const button = ledButton({
        label: source === 'ext-camera' ? 'Ext cam' : `Key ${source}`, title: 'Key source',
        onClick: () => store.dispatch({ type: 'SET_DSK_KEY_SOURCE', source }),
      });
      this.refresh.push((s) => button.set(s.dsk.keySource === source ? 'on' : 'off'));
      grid.appendChild(button.el);
    }
    const edge = ledButton({
      label: 'Edge', title: 'Cycles the six edge styles',
      onClick: () => store.dispatch({ type: 'PRESS_DSK_EDGE' }),
    });
    this.refresh.push((s) => edge.set(s.dsk.edge === 'normal' ? 'off' : 'on'));
    grid.appendChild(edge.el);
    body(grid);

    const low = createSlider({ label: 'DSK low level' });
    low.addEventListener('mx-input', (e) => store.dispatch({ type: 'SET_DSK_LOW', level: (e as CustomEvent<number>).detail }));
    this.refresh.push((s) => low.setFromStore(s.dsk.low));
    body(this.sliderRow('Level low', low, (s) => pct(s.dsk.low), 64).row);

    const high = createSlider({ label: 'DSK high level' });
    high.addEventListener('mx-input', (e) => store.dispatch({ type: 'SET_DSK_HIGH', level: (e as CustomEvent<number>).detail }));
    this.refresh.push((s) => high.setFromStore(s.dsk.high));
    body(this.sliderRow('Level high', high, (s) => pct(s.dsk.high), 64).row);

    const note = document.createElement('span');
    note.className = 'mx-note';
    this.refresh.push((s) => (note.textContent = `Edge · ${dskEdgeStyleLabel(s.dsk.edge)}`));
    body(note);
    return el;
  }

  // ---- Fade control ----
  private buildFade(store: PanelStore): HTMLElement {
    const { el, body } = this.block('Fade control', 'F');

    const enables = this.grid(3);
    const elements: { key: FadeElement; label: string }[] = [
      { key: 'video', label: 'Video' }, { key: 'dsk', label: 'DSK' }, { key: 'audio', label: 'Audio' },
    ];
    for (const element of elements) {
      const button = ledButton({
        label: element.label,
        onClick: () => store.dispatch({ type: 'SET_FADE_ENABLE', element: element.key, on: !store.getSnapshot().fade[element.key] }),
      });
      this.refresh.push((s) => button.set(s.fade[element.key] ? 'on' : 'off'));
      enables.appendChild(button.el);
    }
    body(enables);

    const targets = this.grid(5, true);
    for (const target of ['matte', 'white', 'black', 'A', 'B'] as FadeTarget[]) {
      const button = ledButton({
        label: target, shape: 'minibar', stack: true,
        onClick: () => store.dispatch({ type: 'SET_FADE_TARGET', target }),
      });
      this.refresh.push((s) => button.set(s.fade.target === target ? 'on' : 'off'));
      targets.appendChild(button.el);
    }
    body(targets);

    const lever = createSlider({ label: 'Fade Control lever, IN to OUT', tone: 'red' });
    lever.addEventListener('mx-input', (e) => store.dispatch({ type: 'SET_FADE_LEVER', position: (e as CustomEvent<number>).detail }));
    this.refresh.push((s) => lever.setFromStore(s.fade.lever));
    const leverRow = document.createElement('div');
    leverRow.className = 'mx-srow';
    const inLabel = document.createElement('span');
    inLabel.className = 'slabel';
    inLabel.style.width = '16px';
    inLabel.textContent = 'In';
    const outLabel = document.createElement('span');
    outLabel.className = 'slabel';
    outLabel.style.cssText = 'width:24px;text-align:right';
    outLabel.textContent = 'Out';
    leverRow.append(inLabel, lever, outLabel);
    body(leverRow);

    const autoFade = ledButton({
      label: 'Auto fade', wide: true, shape: 'dot',
      onClick: () => store.dispatch({ type: 'PRESS_AUTO_FADE', tick: this.tickNow() }),
    });
    this.refresh.push((s) =>
      autoFade.set(s.fade.auto.phase === 'running' ? 'on' : s.fade.auto.phase === 'paused' ? 'blink' : 'off'),
    );
    body(autoFade.el);
    return el;
  }

  // ---- Event memory + Special modes ----
  private buildMemory(store: PanelStore): HTMLElement {
    const el = document.createElement('section');
    el.className = 'mx-block';
    el.setAttribute('role', 'group');
    el.setAttribute('aria-label', 'Event memory and special modes');
    el.style.cssText += ';display:grid;grid-template-columns:1fr 1fr;gap:16px';

    const memory = document.createElement('div');
    memory.style.cssText = 'display:flex;flex-direction:column;gap:9px';
    const memHead = document.createElement('div');
    memHead.className = 'mx-block-head';
    const memTitle = document.createElement('span');
    memTitle.textContent = 'Event memory';
    const memId = document.createElement('span');
    memId.className = 'mx-block-id';
    memId.textContent = 'H-1';
    memHead.append(memTitle, memId);
    memory.appendChild(memHead);

    const memModes = document.createElement('div');
    memModes.className = 'mx-row';
    const memoryBtn = ledButton({
      label: 'Memory', title: 'Latch store-mode: the next EVENT NO. stores the panel snapshot',
      onClick: () => store.dispatch({ type: 'PRESS_MEMORY' }),
    });
    this.refresh.push((s) => memoryBtn.set(s.memory.memoryArmed ? 'on' : 'off'));
    const clear = ledButton({ label: 'Clear all', title: 'Mass-clear every stored event', onClick: () => store.dispatch({ type: 'CLEAR_ALL_SLOTS' }) });
    memModes.append(memoryBtn.el, clear.el);
    memory.appendChild(memModes);

    const slots = this.grid(8, true);
    for (let n = 1; n <= 8; n++) {
      const button = ledButton({
        label: String(n), shape: 'minibar', stack: true, mono: true,
        title: `Event ${n} — store when MEMORY is latched, else arm recall (Auto Take runs it)`,
        onClick: () => store.dispatch({ type: 'PRESS_EVENT_NO', button: ((n - 1) % 4) + 1, shift: n > 4 }),
      });
      this.refresh.push((s) => {
        const armed = s.memory.armedSlot === n;
        const occupied = s.memory.slots[n - 1] !== null && s.memory.slots[n - 1] !== undefined;
        button.setTone(armed ? 'amber' : 'green');
        button.set(armed ? 'blink' : occupied ? 'on' : 'off');
      });
      slots.appendChild(button.el);
    }
    memory.appendChild(slots);

    const special = document.createElement('div');
    special.style.cssText = 'display:flex;flex-direction:column;gap:9px';
    const spHead = document.createElement('div');
    spHead.className = 'mx-block-head';
    const spTitle = document.createElement('span');
    spTitle.textContent = 'Special modes';
    const spId = document.createElement('span');
    spId.className = 'mx-block-id';
    spId.textContent = 'H-2';
    spHead.append(spTitle, spId);
    special.appendChild(spHead);

    const spToggleRow = document.createElement('div');
    spToggleRow.className = 'mx-row';
    const spToggle = ledButton({
      label: 'Mem + shift', title: 'The MEMORY+SHIFT chord: enter/leave Special Mode',
      onClick: () => store.dispatch({ type: 'PRESS_MEMORY_SHIFT' }),
    });
    this.refresh.push((s) => spToggle.set(s.specialMode.active ? 'on' : 'off'));
    spToggleRow.appendChild(spToggle.el);
    special.appendChild(spToggleRow);

    const macros = this.grid(4, true);
    for (const macro of SPECIAL_MACROS) {
      const button = ledButton({
        label: macro.name, shape: 'minibar', stack: true, title: macro.character || macro.name,
        onClick: () =>
          store.dispatch({ type: 'SELECT_SPECIAL_MACRO', button: (((macro.ordinal - 1) % 4) + 1) as 1 | 2 | 3 | 4, shift: macro.ordinal > 4 }),
      });
      this.refresh.push((s) => button.set(s.specialMode.armed === macro.id ? 'blink' : 'off'));
      macros.appendChild(button.el);
    }
    special.appendChild(macros);

    el.append(memory, special);
    return el;
  }
}

let defined = false;

/** Define the element (once) and return a bound instance for the given store. */
export function createConsole(store: PanelStore, tickNow: () => number = () => 0): MxConsole {
  if (!defined) {
    customElements.define('mx-console', MxConsole);
    defined = true;
  }
  const console = document.createElement('mx-console') as MxConsole;
  console.bind(store, tickNow);
  return console;
}
