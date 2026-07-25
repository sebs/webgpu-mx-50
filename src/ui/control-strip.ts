// The first control surface (ADR-0013): a hybrid panel-layout strip built as a native
// Web Component. It preserves the WJ-MX50's grouping — per-bus source buttons, Program
// Out selector, transition selector, the Mix/Wipe lever, and the Matte controls — as
// clean, accessible, remappable controls, not a photoreal panel. It only reads the store
// snapshot to reflect state and dispatches typed commands on interaction (ADR-0011); it
// never touches the render loop. The dedicated primitive library (LED button, fader,
// joystick as their own elements) is fleshed out in Phase 8; Phase 1 uses native
// button/range/checkbox controls, which are accessible out of the box.

import { matteColorName } from '../core/matte.js';
import type { PanelStore } from '../state/store.js';
import type { BusId, BusSource } from '../core/types.js';
import type { PanelState, ProgramOut, TransitionType, WipeFamily } from '../state/state.js';

const SOURCE_CHOICES: { label: string; value: BusSource }[] = [
  { label: '1', value: 1 },
  { label: '2', value: 2 },
  { label: '3', value: 3 },
  { label: '4', value: 4 },
  { label: 'Matte', value: 'matte' },
];

const PROGRAM_CHOICES: { label: string; value: ProgramOut }[] = [
  { label: 'A', value: 'A' },
  { label: 'B', value: 'B' },
  { label: 'EFFECT', value: 'effect' },
];

const TRANSITION_CHOICES: { label: string; value: TransitionType }[] = [
  { label: 'MIX', value: 'mix' },
  { label: 'NAM', value: 'nam' },
  { label: 'WIPE', value: 'wipe' },
];

const WIPE_FAMILY_CHOICES: { label: string; value: WipeFamily }[] = [
  { label: 'Str', value: 'straight' },
  { label: 'Cor', value: 'corner' },
  { label: 'Dia', value: 'diagonal' },
  { label: 'Tri', value: 'triangle' },
  { label: 'Spl', value: 'split' },
  { label: 'Mos', value: 'mosaic' },
  { label: 'Sqr', value: 'square' },
];

const STYLE = `
mx-control-strip { display:block; width:min(100%,1280px); margin:0.75rem auto 0; color:#e6e8eb; }
mx-control-strip .row { display:flex; gap:0.75rem; flex-wrap:wrap; align-items:center; margin:0.35rem 0; }
mx-control-strip .group { display:flex; gap:0.35rem; align-items:center; padding:0.35rem 0.5rem; border:1px solid #23272e; border-radius:8px; background:#111418; }
mx-control-strip .label { font-size:0.72rem; letter-spacing:0.04em; text-transform:uppercase; color:#8b93a1; margin-right:0.25rem; }
mx-control-strip button { font:inherit; padding:0.3rem 0.6rem; border-radius:6px; border:1px solid #2a2f38; background:#171b21; color:#cfd4dc; cursor:pointer; }
mx-control-strip button:hover { background:#1e232b; }
mx-control-strip button[aria-pressed="true"] { background:#2d6cdf; border-color:#2d6cdf; color:#fff; }
mx-control-strip input[type="range"] { width:180px; }
mx-control-strip label.chk { display:flex; gap:0.3rem; align-items:center; font-size:0.85rem; }
`;

export class MxControlStrip extends HTMLElement {
  private store: PanelStore | null = null;
  private unsubscribe: (() => void) | null = null;
  private readonly refresh: Array<(state: PanelState) => void> = [];

  bind(store: PanelStore): void {
    this.store = store;
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
    this.textContent = '';
    this.refresh.length = 0;

    if (!document.getElementById('mx-control-strip-style')) {
      const style = document.createElement('style');
      style.id = 'mx-control-strip-style';
      style.textContent = STYLE;
      document.head.appendChild(style);
    }

    // Per-bus source selectors.
    for (const bus of ['A', 'B'] as BusId[]) {
      const group = this.group(`${bus}-bus source`);
      for (const choice of SOURCE_CHOICES) {
        const button = this.button(choice.label, () =>
          store.dispatch({ type: 'ASSIGN_SOURCE', bus, source: choice.value }),
        );
        this.refresh.push((s) =>
          button.setAttribute('aria-pressed', String((bus === 'A' ? s.busA : s.busB).source === choice.value)),
        );
        group.appendChild(button);
      }
      this.appendRow(group);
    }

    // Program Out + Transition.
    const row = document.createElement('div');
    row.className = 'row';

    const programGroup = this.group('Program Out');
    for (const choice of PROGRAM_CHOICES) {
      const button = this.button(choice.label, () => store.dispatch({ type: 'SET_PROGRAM_OUT', mode: choice.value }));
      this.refresh.push((s) => button.setAttribute('aria-pressed', String(s.programOut === choice.value)));
      programGroup.appendChild(button);
    }
    row.appendChild(programGroup);

    const transitionGroup = this.group('Transition');
    for (const choice of TRANSITION_CHOICES) {
      const button = this.button(choice.label, () =>
        store.dispatch({ type: 'SET_TRANSITION_TYPE', transition: choice.value }),
      );
      this.refresh.push((s) => button.setAttribute('aria-pressed', String(s.transition.type === choice.value)));
      transitionGroup.appendChild(button);
    }
    row.appendChild(transitionGroup);
    this.appendChild(row);

    // Mix/Wipe lever.
    const leverGroup = this.group('Mix/Wipe lever');
    const lever = document.createElement('input');
    lever.type = 'range';
    lever.min = '0';
    lever.max = '1';
    lever.step = '0.001';
    lever.setAttribute('aria-label', 'Mix/Wipe lever, A to B');
    lever.addEventListener('input', () => store.dispatch({ type: 'SET_LEVER', position: Number(lever.value) }));
    this.refresh.push((s) => {
      if (document.activeElement !== lever) lever.value = String(s.transition.lever);
    });
    const leverLabel = document.createElement('span');
    leverLabel.className = 'label';
    leverGroup.append('A', lever, 'B', leverLabel);
    this.refresh.push((s) => (leverLabel.textContent = s.transition.lever.toFixed(2)));
    this.appendRow(leverGroup);

    // Matte controls.
    const matteGroup = this.group('Matte');
    const name = document.createElement('span');
    name.style.minWidth = '5.5rem';
    matteGroup.appendChild(this.button('∨', () => store.dispatch({ type: 'STEP_MATTE_COLOR', direction: 'down' })));
    matteGroup.appendChild(name);
    matteGroup.appendChild(this.button('∧', () => store.dispatch({ type: 'STEP_MATTE_COLOR', direction: 'up' })));

    const level = document.createElement('input');
    level.type = 'range';
    level.min = '0';
    level.max = '1';
    level.step = '0.01';
    level.setAttribute('aria-label', 'Matte level');
    level.addEventListener('input', () => store.dispatch({ type: 'SET_MATTE_LEVEL', level: Number(level.value) }));

    const gradationLabel = document.createElement('label');
    gradationLabel.className = 'chk';
    const gradation = document.createElement('input');
    gradation.type = 'checkbox';
    gradation.addEventListener('change', () => store.dispatch({ type: 'SET_GRADATION', on: gradation.checked }));
    gradationLabel.append(gradation, 'Gradation');

    matteGroup.append('Level', level, gradationLabel);
    this.refresh.push((s) => {
      name.textContent = matteColorName(s.matte.colorIndex);
      if (document.activeElement !== level) level.value = String(s.matte.level);
      gradation.checked = s.matte.gradation;
    });
    this.appendRow(matteGroup);

    // Wipe pattern controls (effective when the WIPE transition is selected).
    const wipeGroup = this.group('Wipe');
    for (const choice of WIPE_FAMILY_CHOICES) {
      const button = this.button(choice.label, () => store.dispatch({ type: 'PRESS_WIPE_FAMILY', family: choice.value }));
      this.refresh.push((s) => button.setAttribute('aria-pressed', String(s.transition.wipe.family === choice.value)));
      wipeGroup.appendChild(button);
    }
    const variantLabel = document.createElement('span');
    variantLabel.className = 'label';
    this.refresh.push((s) => (variantLabel.textContent = `v${s.transition.wipe.variant + 1}`));
    wipeGroup.append(variantLabel);
    wipeGroup.appendChild(this.button('Border', () => store.dispatch({ type: 'PRESS_BORDER' })));
    wipeGroup.appendChild(this.button('Soft', () => store.dispatch({ type: 'PRESS_SOFT' })));
    const edgeLabel = document.createElement('span');
    edgeLabel.className = 'label';
    this.refresh.push((s) => (edgeLabel.textContent = s.transition.wipe.edge));
    wipeGroup.append(edgeLabel);
    this.appendRow(wipeGroup);

    // Wipe direction + aspect.
    const dirGroup = this.group('Wipe dir');
    const reverse = this.checkbox('Reverse', (on) => store.dispatch({ type: 'SET_REVERSE', on }));
    const oneWay = this.checkbox('One-way', (on) => store.dispatch({ type: 'SET_ONE_WAY', on }));
    const aspect = document.createElement('input');
    aspect.type = 'range';
    aspect.min = '-1';
    aspect.max = '1';
    aspect.step = '0.01';
    aspect.setAttribute('aria-label', 'Wipe aspect (Square family)');
    aspect.addEventListener('input', () => store.dispatch({ type: 'SET_WIPE_ASPECT', value: Number(aspect.value) }));
    dirGroup.append(reverse.label, oneWay.label, 'Aspect', aspect);
    this.refresh.push((s) => {
      reverse.input.checked = s.transition.wipe.reverse;
      oneWay.input.checked = s.transition.wipe.oneWay;
      if (document.activeElement !== aspect) aspect.value = String(s.transition.wipe.aspect);
    });
    this.appendRow(dirGroup);

    // Subscribe + initial reflect.
    this.unsubscribe?.();
    this.unsubscribe = store.subscribe((next) => this.reflect(next));
    this.reflect(store.getSnapshot());
  }

  private reflect(state: PanelState): void {
    for (const fn of this.refresh) fn(state);
  }

  private group(label: string): HTMLDivElement {
    const group = document.createElement('div');
    group.className = 'group';
    const span = document.createElement('span');
    span.className = 'label';
    span.textContent = label;
    group.appendChild(span);
    return group;
  }

  private appendRow(child: HTMLElement): void {
    const row = document.createElement('div');
    row.className = 'row';
    row.appendChild(child);
    this.appendChild(row);
  }

  private button(label: string, onClick: () => void): HTMLButtonElement {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = label;
    button.setAttribute('aria-pressed', 'false');
    button.addEventListener('click', onClick);
    return button;
  }

  private checkbox(label: string, onChange: (on: boolean) => void): { label: HTMLLabelElement; input: HTMLInputElement } {
    const wrapper = document.createElement('label');
    wrapper.className = 'chk';
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.addEventListener('change', () => onChange(input.checked));
    wrapper.append(input, label);
    return { label: wrapper, input };
  }
}

let defined = false;

/** Define the element (once) and return a bound instance for the given store. */
export function createControlStrip(store: PanelStore): MxControlStrip {
  if (!defined) {
    customElements.define('mx-control-strip', MxControlStrip);
    defined = true;
  }
  const strip = document.createElement('mx-control-strip') as MxControlStrip;
  strip.bind(store);
  return strip;
}
