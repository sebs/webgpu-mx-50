// mx-joystick — the two-axis pads (styleguide): `knob` mode is the RGB colour-correct
// joystick (round cap over a radial well with crosshair axes); `frame` mode is the
// Positioner pad (grid-lined screen with the amber inset frame; the frame's size is
// fed separately from the Positioner SIZE state). Axes are -1..1 with (0,0) = centre.
// Emits a bubbling `mx-move` event with {x, y}; arrows nudge (Shift = fine), Home centres.

export interface JoystickMove {
  x: number;
  y: number;
}

export class MxJoystick extends HTMLElement {
  private xNow = 0;
  private yNow = 0;
  private frameSize = 20;
  private dragging = false;
  private built = false;
  private knob: HTMLElement | null = null;
  private frame: HTMLElement | null = null;
  mode: 'knob' | 'frame' = 'knob';

  setFromStore(x: number, y: number): void {
    if (this.dragging) return;
    this.xNow = clampAxis(x);
    this.yNow = clampAxis(y);
    this.render();
  }

  /** Frame mode only: the inset size as a fraction 0..1 of the screen. */
  setFrameSize(size: number): void {
    this.frameSize = Math.min(100, Math.max(4, size * 100));
    this.render();
  }

  set disabled(off: boolean) {
    this.setAttribute('data-disabled', String(off));
  }

  connectedCallback(): void {
    if (this.built) return;
    this.built = true;
    this.setAttribute('data-mode', this.mode);
    this.tabIndex = 0;
    this.setAttribute('role', 'application');

    if (this.mode === 'knob') {
      const h = document.createElement('div');
      h.className = 'haxis';
      const v = document.createElement('div');
      v.className = 'vaxis';
      this.knob = document.createElement('div');
      this.knob.className = 'knob';
      this.append(h, v, this.knob);
    } else {
      const grid = document.createElement('div');
      grid.className = 'gridlines';
      this.frame = document.createElement('div');
      this.frame.className = 'frame';
      this.append(grid, this.frame);
    }
    this.render();

    this.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      this.setPointerCapture(e.pointerId);
      this.dragging = true;
      this.focus();
      this.applyPointer(e);
    });
    this.addEventListener('pointermove', (e) => {
      if (this.dragging) this.applyPointer(e);
    });
    const end = (): void => {
      this.dragging = false;
    };
    this.addEventListener('pointerup', end);
    this.addEventListener('pointercancel', end);
    this.addEventListener('keydown', (e) => this.applyKey(e));
  }

  private render(): void {
    const left = `${(this.xNow + 1) * 50}%`;
    const top = `${(this.yNow + 1) * 50}%`;
    if (this.knob) {
      this.knob.style.left = left;
      this.knob.style.top = top;
    }
    if (this.frame) {
      this.frame.style.left = left;
      this.frame.style.top = top;
      this.frame.style.width = `${this.frameSize}%`;
      this.frame.style.height = `${this.frameSize}%`;
    }
  }

  private applyPointer(e: PointerEvent): void {
    const rect = this.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    this.commit(((e.clientX - rect.left) / rect.width) * 2 - 1, ((e.clientY - rect.top) / rect.height) * 2 - 1);
    e.preventDefault();
  }

  private applyKey(e: KeyboardEvent): void {
    const d = e.shiftKey ? 0.01 : 0.05;
    if (e.key === 'ArrowLeft') this.commit(this.xNow - d, this.yNow);
    else if (e.key === 'ArrowRight') this.commit(this.xNow + d, this.yNow);
    else if (e.key === 'ArrowUp') this.commit(this.xNow, this.yNow - d);
    else if (e.key === 'ArrowDown') this.commit(this.xNow, this.yNow + d);
    else if (e.key === 'Home') this.commit(0, 0);
    else return;
    e.preventDefault();
  }

  private commit(x: number, y: number): void {
    if (this.getAttribute('data-disabled') === 'true') return;
    const nx = Math.round(clampAxis(x) * 1000) / 1000;
    const ny = Math.round(clampAxis(y) * 1000) / 1000;
    if (nx === this.xNow && ny === this.yNow) return;
    this.xNow = nx;
    this.yNow = ny;
    this.render();
    this.dispatchEvent(new CustomEvent<JoystickMove>('mx-move', { detail: { x: nx, y: ny }, bubbles: true }));
  }
}

function clampAxis(v: number): number {
  return Math.min(1, Math.max(-1, v));
}

let defined = false;

export function createJoystick(mode: 'knob' | 'frame', label: string): MxJoystick {
  if (!defined) {
    customElements.define('mx-joystick', MxJoystick);
    defined = true;
  }
  const stick = document.createElement('mx-joystick') as MxJoystick;
  stick.mode = mode;
  stick.setAttribute('aria-label', label);
  return stick;
}
