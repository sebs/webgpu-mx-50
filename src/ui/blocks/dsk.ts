// E Downstream key (reference §10) as a connected block (ADR-0017).

import { MxBlock } from './base.js';
import { ledButton, pct } from './parts.js';
import { createSlider } from '../primitives/slider.js';
import { dskEdgeStyleLabel } from '../../core/dsk.js';
import type { PanelStore } from '../../state/store.js';
import type { DskFill, DskKeySource } from '../../state/state.js';

export class MxDskBlock extends MxBlock {
  protected render(store: PanelStore): void {
    const body = this.chrome('Downstream key', 'E');

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
        label: source === 'ext-camera' ? 'Ext cam' : `Key ${source}`,
        title:
          source === 'ext-camera'
            ? 'Key source — EXT. CAMERA (the composite stands in until a camera is attached)'
            : 'Key source',
        onClick: () => store.dispatch({ type: 'SET_DSK_KEY_SOURCE', source }),
      });
      if (source === 'ext-camera') button.el.classList.add('mx-extcam');
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
  }
}
