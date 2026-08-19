// B-4 Colour correction (reference §6) as a connected block (ADR-0017).

import { MxBlock } from './base.js';
import { ledButton } from './parts.js';
import { createSlider } from '../primitives/slider.js';
import { createJoystick } from '../primitives/joystick.js';
import type { PanelStore } from '../../state/store.js';
import type { BusId } from '../../core/types.js';

export class MxColourCorrectionBlock extends MxBlock {
  protected render(store: PanelStore): void {
    const body = this.chrome('Colour corr', 'B-4');

    const buttons = this.grid(2);
    for (const bus of ['A', 'B'] as BusId[]) {
      const button = ledButton({
        label: `CC ${bus}`,
        title: 'Cycles: off → CHROMA (blink) → +RGB joystick (solid) → off',
        onClick: () => store.dispatch({ type: 'PRESS_COLOUR_CORRECT', bus }),
      });
      this.refresh.push((s) => {
        const mode = (bus === 'A' ? s.busA : s.busB).colourCorrect.mode;
        button.set(mode === 'chroma-plus-joystick' ? 'on' : mode === 'chroma-only' ? 'blink' : 'off');
      });
      buttons.appendChild(button.el);
    }
    body(buttons);

    // One physical RGB joystick: it drives every bus whose CC mode has the joystick
    // active (reference §6), and reflects the first such bus.
    const stick = createJoystick('knob', 'RGB colour correction joystick');
    stick.addEventListener('mx-move', (e) => {
      const { x, y } = (e as CustomEvent<{ x: number; y: number }>).detail;
      const s = store.getSnapshot();
      for (const bus of ['A', 'B'] as BusId[]) {
        if ((bus === 'A' ? s.busA : s.busB).colourCorrect.mode === 'chroma-plus-joystick') {
          store.dispatch({ type: 'SET_CC_JOYSTICK', bus, x, y });
        }
      }
    });
    this.refresh.push((s) => {
      const active = s.busA.colourCorrect.mode === 'chroma-plus-joystick' ? s.busA
        : s.busB.colourCorrect.mode === 'chroma-plus-joystick' ? s.busB : null;
      stick.disabled = active === null;
      if (active) stick.setFromStore(active.colourCorrect.joystickX, active.colourCorrect.joystickY);
    });
    body(stick);

    for (const bus of ['A', 'B'] as BusId[]) {
      const chroma = createSlider({ label: `${bus}-bus CHROMA` });
      chroma.addEventListener('mx-input', (e) =>
        store.dispatch({ type: 'SET_CHROMA', bus, value: (e as CustomEvent<number>).detail }),
      );
      this.refresh.push((s) => chroma.setFromStore((bus === 'A' ? s.busA : s.busB).colourCorrect.chroma));
      body(this.sliderRow(`Chroma ${bus}`, chroma, null, 44).row);
    }
  }
}
