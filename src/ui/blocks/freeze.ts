// C §8.5–8.10 Freeze family + A/V Synchro as a connected block (ADR-0017).

import { MxBlock } from './base.js';
import { ledButton, pct } from './parts.js';
import { createSlider } from '../primitives/slider.js';
import { AV_SYNCHRO_EFFECTS } from '../../core/av-synchro.js';
import type { PanelStore } from '../../state/store.js';

export class MxFreezeBlock extends MxBlock {
  protected render(store: PanelStore): void {
    const body = this.chrome('Freeze / frame', 'C · 8.5–8.10');

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
  }
}
