// C Digital effect — the filter family (reference §8.1–8.4) as a connected block (ADR-0017).

import { MxBlock } from './base.js';
import { ledButton, pct } from './parts.js';
import { createSlider } from '../primitives/slider.js';
import type { PanelStore } from '../../state/store.js';
import type { BusId } from '../../core/types.js';
import type { FilterEffect } from '../../state/state.js';

export class MxDigitalEffectBlock extends MxBlock {
  protected render(store: PanelStore): void {
    const body = this.chrome('Digital effect', 'C');

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
  }
}
