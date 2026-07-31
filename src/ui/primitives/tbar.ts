// mx-tbar — the Mix/Wipe transition lever (styleguide hero control): an 88×340
// vertical slot with a wide machined handle and an amber travel line. Value 0 = A end
// (top), 1 = B end (bottom), matching SET_LEVER. During Auto Take the store glides the
// value and `setFromStore` renders the motion; drags are pointer-captured and echo-safe.

import { RangeControl } from './range-control.js';

const HEIGHT = 340;
const MARGIN = 16;
const HANDLE = 34;
const USABLE = HEIGHT - 2 * MARGIN - HANDLE;

export class MxTbar extends RangeControl {
  private travel: HTMLElement | null = null;
  private handle: HTMLElement | null = null;

  protected buildParts(): void {
    const slot = document.createElement('div');
    slot.className = 'slot';
    this.travel = document.createElement('div');
    this.travel.className = 'travel';
    this.handle = document.createElement('div');
    this.handle.className = 'handle';
    this.append(slot, this.travel, this.handle);
    this.setAttribute('aria-orientation', 'vertical');
  }

  protected render(): void {
    const top = MARGIN + this.ratio * USABLE;
    if (this.handle) this.handle.style.top = `${top}px`;
    if (this.travel) this.travel.style.height = `${top + HANDLE / 2 - MARGIN}px`;
  }

  protected pointerRatio(e: PointerEvent): number {
    const rect = this.getBoundingClientRect();
    return (e.clientY - rect.top - MARGIN - HANDLE / 2) / USABLE;
  }

  // Up moves toward the A end (value 0), down toward B — the lever's physical throw.
  protected keyDirection(key: string): number {
    if (key === 'ArrowDown' || key === 'ArrowRight') return 1;
    if (key === 'ArrowUp' || key === 'ArrowLeft') return -1;
    return 0;
  }
}

let defined = false;

export function createTbar(label: string): MxTbar {
  if (!defined) {
    customElements.define('mx-tbar', MxTbar);
    defined = true;
  }
  const tbar = document.createElement('mx-tbar') as MxTbar;
  tbar.min = 0;
  tbar.max = 1;
  tbar.step = 0.001;
  tbar.setAttribute('aria-label', label);
  return tbar;
}
