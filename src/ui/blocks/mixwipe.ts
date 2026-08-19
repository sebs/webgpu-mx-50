// D Mix / Wipe (reference §9) — transition selector, the 7×4 pattern matrix, modifier
// and edge rows, key/wipe levels, and the lever column with AUTO TAKE — as a connected
// block (ADR-0017).

import { MxBlock } from './base.js';
import { ledButton, pct } from './parts.js';
import { createSlider } from '../primitives/slider.js';
import { createTbar } from '../primitives/tbar.js';
import type { PanelStore } from '../../state/store.js';
import type { PanelState, WipeFamily } from '../../state/state.js';

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

function pad3(n: number): string {
  return n < 10 ? `00${n}` : n < 100 ? `0${n}` : String(n);
}

export class MxMixWipeBlock extends MxBlock {
  protected render(store: PanelStore): void {
    this.chrome('Mix / wipe', 'D');
    this.style.flexDirection = 'row';
    this.style.gap = '12px';
    // Rebuild the block as a two-column body under the header the chrome() helper made.
    const head = this.firstElementChild as HTMLElement;
    this.textContent = '';
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

    this.append(left, divider, right);
  }
}
