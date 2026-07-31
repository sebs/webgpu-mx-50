// Shared behaviour for the one-axis control primitives (ADR-0013 primitive layer):
// mx-slider, mx-fader, mx-tbar. Owns the value model (min/max/step quantisation),
// pointer capture, and the full keyboard contract — arrows step, Shift = fine,
// PageUp/PageDown = coarse, Home/End = ends — plus the ARIA slider semantics.
//
// Primitives are store-agnostic: value in via `setFromStore` (ignored mid-drag so the
// store echo never fights the pointer), value out via the bubbling `mx-input` event.

export abstract class RangeControl extends HTMLElement {
  min = 0;
  max = 1;
  step = 0.01;

  protected valueNow = 0;
  private dragging = false;
  private built = false;

  /** Ratio 0..1 along the control's travel for the current value. */
  protected get ratio(): number {
    return this.max === this.min ? 0 : (this.valueNow - this.min) / (this.max - this.min);
  }

  get value(): number {
    return this.valueNow;
  }

  set value(v: number) {
    const clamped = Math.min(this.max, Math.max(this.min, v));
    this.valueNow = clamped;
    if (this.built) {
      this.setAttribute('aria-valuenow', String(Math.round(clamped * 1000) / 1000));
      this.render();
    }
  }

  /** Reflect a store snapshot; skipped while the user is dragging this control. */
  setFromStore(v: number): void {
    if (!this.dragging) this.value = v;
  }

  connectedCallback(): void {
    if (this.built) return;
    this.built = true;
    this.buildParts();
    this.tabIndex = 0;
    this.setAttribute('role', 'slider');
    this.setAttribute('aria-valuemin', String(this.min));
    this.setAttribute('aria-valuemax', String(this.max));
    this.value = this.valueNow;

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

  /** Build the child parts (fill/slot/handle) once. */
  protected abstract buildParts(): void;

  /** Position the parts for the current value. */
  protected abstract render(): void;

  /** Travel ratio 0..1 for a pointer event (0 = value at `min`). */
  protected abstract pointerRatio(e: PointerEvent): number;

  /** Keyboard direction for a key, in steps: +1 toward max, -1 toward min, 0 = not handled. */
  protected abstract keyDirection(key: string): number;

  private applyPointer(e: PointerEvent): void {
    const r = Math.min(1, Math.max(0, this.pointerRatio(e)));
    this.commit(this.min + r * (this.max - this.min));
    e.preventDefault();
  }

  private applyKey(e: KeyboardEvent): void {
    const span = this.max - this.min;
    let delta = 0;
    const dir = this.keyDirection(e.key);
    if (dir !== 0) delta = dir * (e.shiftKey ? span / 500 : span / 50);
    else if (e.key === 'PageUp') delta = span / 10;
    else if (e.key === 'PageDown') delta = -span / 10;
    else if (e.key === 'Home') delta = this.min - this.valueNow;
    else if (e.key === 'End') delta = this.max - this.valueNow;
    else return;
    this.commit(this.valueNow + delta);
    e.preventDefault();
  }

  private commit(raw: number): void {
    const stepped = this.min + Math.round((raw - this.min) / this.step) * this.step;
    const v = Math.round(Math.min(this.max, Math.max(this.min, stepped)) * 1e6) / 1e6;
    if (v === this.valueNow) return;
    this.value = v;
    this.dispatchEvent(new CustomEvent<number>('mx-input', { detail: v, bubbles: true }));
  }
}
