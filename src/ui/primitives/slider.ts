// mx-slider — the horizontal slot slider (styleguide: dark well, amber level line,
// 9×14 machined handle). Used for every rotary/level control the hardware exposes as
// a knob: LEVEL, CHROMA, SIZE, TIME, SLICE, HUE, aspect, DSK levels, transition time.
// Set `tone = 'red'` for the Fade lever's red travel line.

import { RangeControl } from './range-control.js';

export class MxSlider extends RangeControl {
  private fill: HTMLElement | null = null;
  private handle: HTMLElement | null = null;

  set tone(tone: 'amber' | 'red') {
    this.setAttribute('data-tone', tone);
  }

  protected buildParts(): void {
    this.fill = document.createElement('div');
    this.fill.className = 'fill';
    this.handle = document.createElement('div');
    this.handle.className = 'handle';
    this.append(this.fill, this.handle);
  }

  protected render(): void {
    const pct = this.ratio * 100;
    if (this.fill) this.fill.style.width = `${pct}%`;
    if (this.handle) this.handle.style.left = `${pct}%`;
  }

  protected pointerRatio(e: PointerEvent): number {
    const rect = this.getBoundingClientRect();
    return rect.width === 0 ? 0 : (e.clientX - rect.left) / rect.width;
  }

  protected keyDirection(key: string): number {
    if (key === 'ArrowRight' || key === 'ArrowUp') return 1;
    if (key === 'ArrowLeft' || key === 'ArrowDown') return -1;
    return 0;
  }
}

let defined = false;

export function createSlider(options: { min?: number; max?: number; step?: number; label: string; tone?: 'amber' | 'red' }): MxSlider {
  if (!defined) {
    customElements.define('mx-slider', MxSlider);
    defined = true;
  }
  const slider = document.createElement('mx-slider') as MxSlider;
  if (options.min !== undefined) slider.min = options.min;
  if (options.max !== undefined) slider.max = options.max;
  if (options.step !== undefined) slider.step = options.step;
  slider.setAttribute('aria-label', options.label);
  if (options.tone) slider.tone = options.tone;
  return slider;
}
