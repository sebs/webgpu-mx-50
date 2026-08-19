// B-3 Audio mixer (reference §5) as a connected block (ADR-0017).

import { MxBlock } from './base.js';
import { ledButton, pct } from './parts.js';
import { createFader } from '../primitives/fader.js';
import type { PanelStore } from '../../state/store.js';
import type { MicAux2Input } from '../../state/state.js';

export class MxAudioBlock extends MxBlock {
  protected render(store: PanelStore): void {
    const body = this.chrome('Audio mixer', 'B-3');
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
  }
}
