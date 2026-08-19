// F Fade control (reference §11) as a connected block (ADR-0017).

import { MxBlock } from './base.js';
import { ledButton } from './parts.js';
import { createSlider } from '../primitives/slider.js';
import type { PanelStore } from '../../state/store.js';
import type { FadeElement, FadeTarget } from '../../state/state.js';

export class MxFadeBlock extends MxBlock {
  protected render(store: PanelStore): void {
    const body = this.chrome('Fade control', 'F');

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
  }
}
