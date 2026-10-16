// The control primitives (ADR-0013 layer 1) on their own: value in through
// setFromStore, value out as a bubbling event — no store, no context, no GPU. Each card
// shows the live primitive and a log of the events it emits, which is the whole contract
// a block builds on.

import { createSlider } from '../../src/ui/primitives/slider.js';
import { createFader } from '../../src/ui/primitives/fader.js';
import { createTbar } from '../../src/ui/primitives/tbar.js';
import { createJoystick } from '../../src/ui/primitives/joystick.js';
import type { JoystickMove } from '../../src/ui/primitives/joystick.js';
import { DemoElement, defineDemo } from './base.js';
import { el } from '../shell.js';

const LOG_LINES = 6;

function logBox(): { box: HTMLElement; push: (line: string) => void } {
  const box = el('div', { class: 'mx-log', attrs: { 'aria-live': 'off' } });
  const lines: string[] = [];
  box.textContent = '— drag, or focus and use the arrow keys';
  return {
    box,
    push: (line) => {
      lines.push(line);
      while (lines.length > LOG_LINES) lines.shift();
      box.textContent = lines.join('\n');
    },
  };
}

function card(title: string, tag: string, control: HTMLElement, wire: (push: (line: string) => void) => void, note: string): HTMLElement {
  const c = el('div', { class: 'mx-panel mx-card' });
  c.innerHTML = `<div><span class="mx-label">&lt;${tag}&gt;</span><h3 style="margin:6px 0 0">${title}</h3></div>`;
  const stage = el('div', { class: 'stage' });
  stage.appendChild(control);
  c.appendChild(stage);
  const { box, push } = logBox();
  wire(push);
  c.appendChild(box);
  c.appendChild(el('p', { class: 'mx-dim', html: note, attrs: { style: 'margin:0;font-size:13px' } }));
  return c;
}

class PrimitivesGallery extends DemoElement {
  protected render(): void {
    const grid = el('div', { class: 'mx-gallery' });

    const slider = createSlider({ label: 'Level' });
    slider.style.width = '180px';
    grid.appendChild(
      card('Slot slider', 'mx-slider', slider, (push) => {
        slider.addEventListener('mx-input', (e) => push(`mx-input  ${(e as CustomEvent<number>).detail.toFixed(2)}`));
        slider.setFromStore(0.5);
      }, 'Every knob on the hardware: LEVEL, CHROMA, SIZE, TIME, the DSK window. Shift = fine steps, Home/End = ends.'),
    );

    const fader = createFader('Channel level');
    grid.appendChild(
      card('Channel fader', 'mx-fader', fader, (push) => {
        fader.addEventListener('mx-input', (e) => push(`mx-input  ${(e as CustomEvent<number>).detail.toFixed(2)}`));
        fader.setFromStore(0.7);
      }, 'The audio mixer\'s vertical faders. 1 = cap at the top.'),
    );

    const tbar = createTbar('Mix/Wipe lever');
    tbar.style.transform = 'scale(0.5)';
    tbar.style.transformOrigin = 'center';
    tbar.style.margin = '-85px 0';
    grid.appendChild(
      card('Transition lever', 'mx-tbar', tbar, (push) => {
        tbar.addEventListener('mx-input', (e) => push(`mx-input  ${(e as CustomEvent<number>).detail.toFixed(3)}  (0 = A, 1 = B)`));
        tbar.setFromStore(0.3);
      }, 'The hero control, shown at half size. Auto Take glides it through <code>setFromStore</code>; a drag is never fought by the echo.'),
    );

    const knob = createJoystick('knob', 'RGB colour joystick');
    knob.style.width = '130px'; // block-level with an aspect ratio: it needs a width to exist
    grid.appendChild(
      card('Colour joystick', 'mx-joystick mode=knob', knob, (push) => {
        knob.addEventListener('mx-move', (e) => {
          const m = (e as CustomEvent<JoystickMove>).detail;
          push(`mx-move  x ${m.x.toFixed(2)}  y ${m.y.toFixed(2)}`);
        });
      }, 'Colour correction\'s RGB pad. Two axes, −1…1, Home re-centres.'),
    );

    const frame = createJoystick('frame', 'Positioner pad');
    frame.style.width = '160px';
    frame.setFrameSize(0.3);
    grid.appendChild(
      card('Positioner pad', 'mx-joystick mode=frame', frame, (push) => {
        frame.addEventListener('mx-move', (e) => {
          const m = (e as CustomEvent<JoystickMove>).detail;
          push(`mx-move  x ${m.x.toFixed(2)}  y ${m.y.toFixed(2)}`);
        });
      }, 'The same element in frame mode, drawing the inset the Positioner places.'),
    );

    this.appendChild(grid);
  }
}

defineDemo('mx-demo-primitives', PrimitivesGallery);
