// B-5 Positioner / Scene Grabber (reference §7) as a connected block (ADR-0017).

import { MxBlock } from './base.js';
import { ledButton } from './parts.js';
import { createSlider } from '../primitives/slider.js';
import { createJoystick } from '../primitives/joystick.js';
import type { PanelStore } from '../../state/store.js';

export class MxPositionBlock extends MxBlock {
  protected render(store: PanelStore): void {
    const body = this.chrome('Positioner', 'B-5');

    const pad = createJoystick('frame', 'Positioner joystick');
    pad.addEventListener('mx-move', (e) => {
      const { x, y } = (e as CustomEvent<{ x: number; y: number }>).detail;
      store.dispatch({ type: 'SET_POSITIONER_JOYSTICK', x, y });
      // The same joystick chooses the Trail start corner while Trail runs (reference §8.8).
      if (store.getSnapshot().digitalEffect.freeze.trail && x !== 0) {
        store.dispatch({ type: 'SET_TRAIL_CORNER', corner: x < 0 ? 'upper-left' : 'upper-right' });
      }
    });
    this.refresh.push((s) => {
      pad.disabled = !s.positioner.on && !s.digitalEffect.freeze.trail;
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
  }
}
