// The first control surface (ADR-0013): a hybrid panel-layout strip built as a native
// Web Component. It preserves the WJ-MX50's grouping — per-bus source buttons, Program
// Out selector, transition selector, the Mix/Wipe lever, and the Matte controls — as
// clean, accessible, remappable controls, not a photoreal panel. It only reads the store
// snapshot to reflect state and dispatches typed commands on interaction (ADR-0011); it
// never touches the render loop. The dedicated primitive library (LED button, fader,
// joystick as their own elements) is fleshed out in Phase 8; Phase 1 uses native
// button/range/checkbox controls, which are accessible out of the box.

import { matteColorName } from '../core/matte.js';
import { dskEdgeStyleLabel } from '../core/dsk.js';
import type { PanelStore } from '../state/store.js';
import type { BusId, BusSource } from '../core/types.js';
import type { DskFill, DskKeySource, FilterEffect, PanelState, ProgramOut, TransitionType, WipeFamily } from '../state/state.js';

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
    const aspectOn = this.checkbox('Aspect ON', (on) => store.dispatch({ type: 'SET_ASPECT_ON', on }));
    dirGroup.append(reverse.label, oneWay.label, aspectOn.label, 'Aspect', aspect);
    this.refresh.push((s) => {
      reverse.input.checked = s.transition.wipe.reverse;
      oneWay.input.checked = s.transition.wipe.oneWay;
      aspectOn.input.checked = s.transition.wipe.aspectOn;
      if (document.activeElement !== aspect) aspect.value = String(s.transition.wipe.aspect);
    });
    this.appendRow(dirGroup);

    // Positioner & Scene Grabber (Square-family wipe only).
    const posGroup = this.group('Positioner');
    const posOn = this.button('Pos ON', () => store.dispatch({ type: 'PRESS_POSITIONER' }));
    this.refresh.push((s) => posOn.setAttribute('aria-pressed', String(s.positioner.on)));
    const posX = document.createElement('input');
    posX.type = 'range';
    posX.min = '-1';
    posX.max = '1';
    posX.step = '0.01';
    posX.setAttribute('aria-label', 'Positioner joystick X');
    posX.addEventListener('input', () =>
      store.dispatch({ type: 'SET_POSITIONER_JOYSTICK', x: Number(posX.value), y: store.getSnapshot().positioner.y }),
    );
    const posY = document.createElement('input');
    posY.type = 'range';
    posY.min = '-1';
    posY.max = '1';
    posY.step = '0.01';
    posY.setAttribute('aria-label', 'Positioner joystick Y');
    posY.addEventListener('input', () =>
      store.dispatch({ type: 'SET_POSITIONER_JOYSTICK', x: store.getSnapshot().positioner.x, y: Number(posY.value) }),
    );
    const posSize = document.createElement('input');
    posSize.type = 'range';
    posSize.min = '0';
    posSize.max = '1';
    posSize.step = '0.01';
    posSize.setAttribute('aria-label', 'Positioner inset size');
    posSize.addEventListener('input', () => store.dispatch({ type: 'SET_POSITIONER_SIZE', value: Number(posSize.value) }));
    const grab = this.button('Grab', () => store.dispatch({ type: 'PRESS_SCENE_GRABBER' }));
    this.refresh.push((s) => grab.setAttribute('aria-pressed', String(s.positioner.sceneGrabber)));
    this.refresh.push((s) => {
      if (document.activeElement !== posX) posX.value = String(s.positioner.x);
      if (document.activeElement !== posY) posY.value = String(s.positioner.y);
      if (document.activeElement !== posSize) posSize.value = String(s.positioner.size);
    });
    posGroup.append(posOn, 'X', posX, 'Y', posY, 'Size', posSize, grab);
    this.appendRow(posGroup);

    // Colour correction (per bus): tri-state button + CHROMA.
    const ccGroup = this.group('Colour correct');
    for (const bus of ['A', 'B'] as BusId[]) {
      const button = this.button(`CC ${bus}`, () => store.dispatch({ type: 'PRESS_COLOUR_CORRECT', bus }));
      this.refresh.push((s) =>
        button.setAttribute('aria-pressed', String((bus === 'A' ? s.busA : s.busB).colourCorrect.mode !== 'off')),
      );
      ccGroup.appendChild(button);
      const chroma = document.createElement('input');
      chroma.type = 'range';
      chroma.min = '0';
      chroma.max = '1';
      chroma.step = '0.01';
      chroma.setAttribute('aria-label', `${bus}-bus CHROMA`);
      chroma.addEventListener('input', () => store.dispatch({ type: 'SET_CHROMA', bus, value: Number(chroma.value) }));
      this.refresh.push((s) => {
        if (document.activeElement !== chroma) chroma.value = String((bus === 'A' ? s.busA : s.busB).colourCorrect.chroma);
      });
      ccGroup.append(`${bus}`, chroma);
    }
    this.appendRow(ccGroup);

    // Digital effect (filters; targets one bus).
    const fxGroup = this.group('Digital FX');
    for (const bus of ['A', 'B'] as BusId[]) {
      const button = this.button(`bus ${bus}`, () => store.dispatch({ type: 'SELECT_EFFECT_BUS', bus }));
      this.refresh.push((s) => button.setAttribute('aria-pressed', String(s.digitalEffect.bus === bus)));
      fxGroup.appendChild(button);
    }
    for (const effect of ['nega', 'mosaic', 'mono', 'paint'] as FilterEffect[]) {
      const button = this.button(effect, () => store.dispatch({ type: 'CHOOSE_EFFECT', effect }));
      this.refresh.push((s) => {
        button.setAttribute('aria-pressed', String(s.digitalEffect.active[effect]));
        button.style.outline = s.digitalEffect.armed === effect ? '2px solid #e6b800' : 'none';
      });
      fxGroup.appendChild(button);
    }
    fxGroup.appendChild(this.button('ON', () => store.dispatch({ type: 'PRESS_EFFECT_ON' })));
    const mosaicSize = document.createElement('input');
    mosaicSize.type = 'range';
    mosaicSize.min = '1';
    mosaicSize.max = '31';
    mosaicSize.step = '1';
    mosaicSize.setAttribute('aria-label', 'Mosaic SIZE');
    mosaicSize.addEventListener('input', () => store.dispatch({ type: 'SET_MOSAIC_SIZE', step: Number(mosaicSize.value) }));
    this.refresh.push((s) => {
      if (document.activeElement !== mosaicSize) mosaicSize.value = String(s.digitalEffect.mosaicSize);
    });
    const paintLevel = document.createElement('input');
    paintLevel.type = 'range';
    paintLevel.min = '0';
    paintLevel.max = '1';
    paintLevel.step = '0.01';
    paintLevel.setAttribute('aria-label', 'Paint LEVEL');
    paintLevel.addEventListener('input', () => store.dispatch({ type: 'SET_PAINT_LEVEL', level: Number(paintLevel.value) }));
    this.refresh.push((s) => {
      if (document.activeElement !== paintLevel) paintLevel.value = String(s.digitalEffect.paintLevel);
    });
    fxGroup.append('Size', mosaicSize, 'Paint', paintLevel);
    this.appendRow(fxGroup);

    // Freeze family (targets the selected Digital-FX bus). Multi/Trail GPU is deferred.
    const freezeGroup = this.group('Freeze FX');
    const still = this.button('Still', () =>
      store.dispatch({ type: 'ENGAGE_FREEZE', effect: 'still', on: !store.getSnapshot().digitalEffect.freeze.still }),
    );
    this.refresh.push((s) => still.setAttribute('aria-pressed', String(s.digitalEffect.freeze.still)));
    const strobe = this.button('Strobe', () =>
      store.dispatch({ type: 'ENGAGE_FREEZE', effect: 'strobe', on: !store.getSnapshot().digitalEffect.freeze.strobe }),
    );
    this.refresh.push((s) => strobe.setAttribute('aria-pressed', String(s.digitalEffect.freeze.strobe)));
    const multi = this.button('Multi', () => store.dispatch({ type: 'PRESS_MULTI' }));
    const multiLabel = document.createElement('span');
    multiLabel.className = 'label';
    this.refresh.push((s) => {
      multi.setAttribute('aria-pressed', String(s.digitalEffect.freeze.multi > 0));
      multiLabel.textContent = s.digitalEffect.freeze.multi === 0 ? '—' : String(s.digitalEffect.freeze.multi);
    });
    const trail = this.button('Trail', () =>
      store.dispatch({ type: 'ENGAGE_FREEZE', effect: 'trail', on: !store.getSnapshot().digitalEffect.freeze.trail }),
    );
    this.refresh.push((s) => trail.setAttribute('aria-pressed', String(s.digitalEffect.freeze.trail)));
    const strobeTime = document.createElement('input');
    strobeTime.type = 'range';
    strobeTime.min = '0';
    strobeTime.max = '1';
    strobeTime.step = '0.01';
    strobeTime.setAttribute('aria-label', 'Strobe TIME');
    strobeTime.addEventListener('input', () => store.dispatch({ type: 'SET_STROBE_TIME', position: Number(strobeTime.value) }));
    this.refresh.push((s) => {
      if (document.activeElement !== strobeTime) strobeTime.value = String(s.digitalEffect.strobeTime);
    });
    freezeGroup.append(still, strobe, multi, multiLabel, trail, 'Strobe TIME', strobeTime);
    this.appendRow(freezeGroup);

    // Keys (Mix/Wipe-stage): Luminance / Chroma + SLICE + HUE.
    const keysGroup = this.group('Keys');
    const lumBtn = this.button('LUM KEY', () => store.dispatch({ type: 'PRESS_LUM_KEY' }));
    this.refresh.push((s) => lumBtn.setAttribute('aria-pressed', String(s.transition.type === 'lum-key')));
    const chromaBtn = this.button('CHROMA', () => store.dispatch({ type: 'PRESS_CHROMA_KEY' }));
    this.refresh.push((s) => chromaBtn.setAttribute('aria-pressed', String(s.transition.type === 'chroma-key')));
    const slice = document.createElement('input');
    slice.type = 'range';
    slice.min = '0';
    slice.max = '1';
    slice.step = '0.01';
    slice.setAttribute('aria-label', 'Key SLICE');
    slice.addEventListener('input', () => store.dispatch({ type: 'SET_SLICE', value: Number(slice.value) }));
    this.refresh.push((s) => {
      if (document.activeElement !== slice) slice.value = String(s.transition.slice);
    });
    const hue = document.createElement('input');
    hue.type = 'range';
    hue.min = '0';
    hue.max = '1';
    hue.step = '0.01';
    hue.setAttribute('aria-label', 'Chroma HUE');
    hue.addEventListener('input', () => store.dispatch({ type: 'SET_HUE', angle: Number(hue.value) }));
    this.refresh.push((s) => {
      if (document.activeElement !== hue) hue.value = String(s.transition.hue);
    });
    keysGroup.append(lumBtn, chromaBtn, 'Slice', slice, 'Hue', hue);
    this.appendRow(keysGroup);

    // Downstream Key panel.
    const dskGroup = this.group('DSK');
    const dskOn = this.button('DSK ON', () => store.dispatch({ type: 'SET_DSK_ON', on: !store.getSnapshot().dsk.on }));
    this.refresh.push((s) => dskOn.setAttribute('aria-pressed', String(s.dsk.on)));
    dskGroup.appendChild(dskOn);
    for (const fill of ['white', 'matte'] as DskFill[]) {
      const b = this.button(fill, () => store.dispatch({ type: 'SET_DSK_FILL', fill }));
      this.refresh.push((s) => b.setAttribute('aria-pressed', String(s.dsk.fill === fill)));
      dskGroup.appendChild(b);
    }
    for (const src of ['ext-camera', 'A', 'B'] as DskKeySource[]) {
      const b = this.button(src === 'ext-camera' ? 'Ext' : src, () => store.dispatch({ type: 'SET_DSK_KEY_SOURCE', source: src }));
      this.refresh.push((s) => b.setAttribute('aria-pressed', String(s.dsk.keySource === src)));
      dskGroup.appendChild(b);
    }
    const low = document.createElement('input');
    low.type = 'range';
    low.min = '0';
    low.max = '1';
    low.step = '0.01';
    low.setAttribute('aria-label', 'DSK Low Level');
    low.addEventListener('input', () => store.dispatch({ type: 'SET_DSK_LOW', level: Number(low.value) }));
    const high = document.createElement('input');
    high.type = 'range';
    high.min = '0';
    high.max = '1';
    high.step = '0.01';
    high.setAttribute('aria-label', 'DSK High Level');
    high.addEventListener('input', () => store.dispatch({ type: 'SET_DSK_HIGH', level: Number(high.value) }));
    const dskEdge = this.button('Edge', () => store.dispatch({ type: 'PRESS_DSK_EDGE' }));
    const dskEdgeLabel = document.createElement('span');
    dskEdgeLabel.className = 'label';
    const dskReverse = this.button('Reverse', () => store.dispatch({ type: 'PRESS_DSK_REVERSE' }));
    this.refresh.push((s) => {
      if (document.activeElement !== low) low.value = String(s.dsk.low);
      if (document.activeElement !== high) high.value = String(s.dsk.high);
      dskEdgeLabel.textContent = dskEdgeStyleLabel(s.dsk.edge);
      dskReverse.setAttribute('aria-pressed', String(s.dsk.reverse));
    });
    dskGroup.append('Lo', low, 'Hi', high, dskEdge, dskEdgeLabel, dskReverse);
    this.appendRow(dskGroup);

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
