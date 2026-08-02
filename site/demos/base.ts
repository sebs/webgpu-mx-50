// Shared plumbing for the site's demo components.
//
// Demos are light-DOM custom elements: no shadow root, so the site stylesheet cascades in
// and every demo inherits the console's tokens and control styling for free. Shadow DOM
// buys encapsulation we do not need here and would force us to duplicate the theme.
//
// Every animated demo runs through `runWhileVisible`, which honours the §5 budget rule —
// only what is on screen animates, and everything stops when the tab is hidden.

/** Register a custom element once (module may be imported by several pages). */
export function defineDemo(tag: string, ctor: CustomElementConstructor): void {
  if (!customElements.get(tag)) customElements.define(tag, ctor);
}

/** Base class: renders once on connect, cleans up its disposers on disconnect. */
export abstract class DemoElement extends HTMLElement {
  private readonly disposers: Array<() => void> = [];
  private rendered = false;

  connectedCallback(): void {
    if (this.rendered) return;
    this.rendered = true;
    this.render();
  }

  disconnectedCallback(): void {
    for (let i = 0; i < this.disposers.length; i++) this.disposers[i]!();
    this.disposers.length = 0;
    this.rendered = false;
  }

  protected onDispose(fn: () => void): void {
    this.disposers.push(fn);
  }

  protected abstract render(): void;
}

/**
 * Run `frame` on rAF only while the element is on screen and the document is visible.
 * Returns a disposer. `frame` receives milliseconds since the run (re)started.
 */
export function runWhileVisible(target: Element, frame: (elapsedMs: number) => void): () => void {
  let raf = 0;
  let started = 0;
  let onScreen = false;

  const tick = (now: number): void => {
    if (!started) started = now;
    frame(now - started);
    raf = requestAnimationFrame(tick);
  };
  const start = (): void => {
    if (raf || !onScreen || document.hidden) return;
    started = 0;
    raf = requestAnimationFrame(tick);
  };
  const stop = (): void => {
    if (!raf) return;
    cancelAnimationFrame(raf);
    raf = 0;
  };

  const io = new IntersectionObserver((entries) => {
    onScreen = entries[entries.length - 1]!.isIntersecting;
    if (onScreen) start();
    else stop();
  });
  io.observe(target);

  const onVisibility = (): void => {
    if (document.hidden) stop();
    else start();
  };
  document.addEventListener('visibilitychange', onVisibility);

  return () => {
    stop();
    io.disconnect();
    document.removeEventListener('visibilitychange', onVisibility);
  };
}

/** True when the visitor asked for reduced motion. */
export function reducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** A labelled control row. */
export function field(labelText: string, control: HTMLElement): HTMLElement {
  const wrap = document.createElement('label');
  wrap.className = 'mx-field';
  const span = document.createElement('span');
  span.textContent = labelText;
  wrap.appendChild(span);
  wrap.appendChild(control);
  return wrap;
}

/** A themed range input. */
export function range(opts: {
  min: number;
  max: number;
  step: number;
  value: number;
  label: string;
  onInput: (v: number) => void;
}): HTMLInputElement {
  const input = document.createElement('input');
  input.type = 'range';
  input.className = 'mx-range';
  input.min = String(opts.min);
  input.max = String(opts.max);
  input.step = String(opts.step);
  input.value = String(opts.value);
  input.setAttribute('aria-label', opts.label);
  input.addEventListener('input', () => opts.onInput(Number(input.value)));
  return input;
}

/** A themed toggle button with an LED. */
export function toggle(labelText: string, pressed: boolean, onChange: (next: boolean) => void): HTMLButtonElement {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'mx-btn';
  b.setAttribute('aria-pressed', pressed ? 'true' : 'false');
  b.innerHTML = `<span class="led" aria-hidden="true"></span><span></span>`;
  (b.lastElementChild as HTMLElement).textContent = labelText;
  b.addEventListener('click', () => {
    const next = b.getAttribute('aria-pressed') !== 'true';
    b.setAttribute('aria-pressed', next ? 'true' : 'false');
    onChange(next);
  });
  return b;
}

/** A plain action button. */
export function button(labelText: string, onClick: () => void): HTMLButtonElement {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'mx-btn';
  b.textContent = labelText;
  b.addEventListener('click', onClick);
  return b;
}

/** A crisp 2D canvas sized in CSS pixels, DPR-capped at 1.5 per the §5 budget rule. */
export function canvas2d(cssW: number, cssH: number): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D; w: number; h: number } {
  const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
  const canvas = document.createElement('canvas');
  canvas.className = 'mx-canvas';
  canvas.width = Math.round(cssW * dpr);
  canvas.height = Math.round(cssH * dpr);
  canvas.style.aspectRatio = `${cssW} / ${cssH}`;
  const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
  ctx.scale(dpr, dpr);
  return { canvas, ctx, w: cssW, h: cssH };
}

/** Read a theme token off the document root. */
export function token(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || '#888';
}

/** An amber-on-well readout box. */
export function readout(text: string, big = false): HTMLElement {
  const d = document.createElement('div');
  d.className = 'mx-readout' + (big ? ' big' : '');
  d.textContent = text;
  return d;
}

/** Zero-padded integer — String.padStart is above banira's compile lib floor. */
export function pad(n: number, width: number): string {
  let s = String(n);
  while (s.length < width) s = '0' + s;
  return s;
}

/** A caption under a demo. */
export function caption(html: string): HTMLElement {
  const p = document.createElement('p');
  p.className = 'mx-dim';
  p.style.margin = '10px 0 0';
  p.style.fontSize = '13px';
  p.innerHTML = html;
  return p;
}

/** A row container. */
export function row(...children: HTMLElement[]): HTMLElement {
  const d = document.createElement('div');
  d.className = 'mx-row';
  for (let i = 0; i < children.length; i++) d.appendChild(children[i]!);
  return d;
}
