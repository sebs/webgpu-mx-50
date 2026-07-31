// mx-fader — the vertical audio channel fader (styleguide: 24×120 well, centre groove,
// machined cap with a scribe line). Value 1 = cap at the top (full level), 0 = bottom.
// The console pairs it with a `.mx-meter` bar it drives separately.

import { RangeControl } from './range-control.js';

const TRACK = 120;
const CAP = 14;
const PAD = 3;

export class MxFader extends RangeControl {
  private handle: HTMLElement | null = null;

  protected buildParts(): void {
    const slot = document.createElement('div');
    slot.className = 'slot';
    this.handle = document.createElement('div');
    this.handle.className = 'handle';
    this.append(slot, this.handle);
    this.setAttribute('aria-orientation', 'vertical');
  }

  protected render(): void {
    if (this.handle) this.handle.style.top = `${PAD + (1 - this.ratio) * (TRACK - CAP - 2 * PAD)}px`;
  }

  protected pointerRatio(e: PointerEvent): number {
    const rect = this.getBoundingClientRect();
    const usable = rect.height - CAP - 2 * PAD;
    return usable <= 0 ? 0 : 1 - (e.clientY - rect.top - PAD - CAP / 2) / usable;
  }

  protected keyDirection(key: string): number {
    if (key === 'ArrowUp' || key === 'ArrowRight') return 1;
    if (key === 'ArrowDown' || key === 'ArrowLeft') return -1;
    return 0;
  }
}

let defined = false;

export function createFader(label: string): MxFader {
  if (!defined) {
    customElements.define('mx-fader', MxFader);
    defined = true;
  }
  const fader = document.createElement('mx-fader') as MxFader;
  fader.min = 0;
  fader.max = 1;
  fader.step = 0.01;
  fader.setAttribute('aria-label', label);
  return fader;
}
