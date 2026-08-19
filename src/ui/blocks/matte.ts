// B-2 Matte generator (reference §4) as a connected block (ADR-0017).

import { MxBlock } from './base.js';
import { ledButton } from './parts.js';
import { createSlider } from '../primitives/slider.js';
import { matteColorName, MATTE_PALETTE } from '../../core/matte.js';
import type { PanelStore } from '../../state/store.js';

/** Swatch backgrounds for the 9 Matte colours, index-aligned with MATTE_PALETTE. */
const MATTE_SWATCHES = [
  'linear-gradient(90deg,#c8c8c8,#c8c832,#32c8c8,#32c832,#c832c8,#c83232,#3232c8,#141414)',
  '#e6e6ea', '#d8c94a', '#4fc4d0', '#4fb26a', '#c057b0', '#c8453f', '#3f6fc8', '#141620',
];

export class MxMatteBlock extends MxBlock {
  protected render(store: PanelStore): void {
    const body = this.chrome('Matte', 'B-2');

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
  }
}
