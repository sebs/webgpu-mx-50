// D15 — the Matte generator: the nine-colour palette in cycle order, LEVEL's
// colour-dependent meaning, and the GRADATION ramp.

import {
  MATTE_PALETTE,
  matteColorAt,
  matteColorName,
  levelAffectsOutput,
  matteIntensityAtY,
  isColourBar,
  matteFlatColor,
  matteChroma,
  matteBrightness,
} from '../../src/core/matte.js';
import type { MatteState } from '../../src/state/state.js';
import { DemoElement, defineDemo, range, field, canvas2d, caption, toggle, token } from './base.js';

function srgb(c: [number, number, number]): string {
  const to8 = (x: number): number => Math.round(Math.max(0, Math.min(1, x)) * 255);
  return `rgb(${to8(c[0])}, ${to8(c[1])}, ${to8(c[2])})`;
}

// The Colour Bar test pattern is a pattern, not a flat colour — matteFlatColor returns
// black for it and callers check isColourBar. These are the standard eight bars.
const BARS: Array<[number, number, number]> = [
  [1, 1, 1],
  [1, 1, 0],
  [0, 1, 1],
  [0, 1, 0],
  [1, 0, 1],
  [1, 0, 0],
  [0, 0, 1],
  [0, 0, 0],
];

class MattePalette extends DemoElement {
  protected render(): void {
    const state: MatteState = { colorIndex: 0, level: 1, gradation: false };

    const { canvas, ctx, w, h } = canvas2d(480, 240);
    const info = document.createElement('div');
    info.style.marginTop = '12px';

    const swatches = document.createElement('div');
    swatches.style.display = 'grid';
    swatches.style.gridTemplateColumns = 'repeat(9, 1fr)';
    swatches.style.gap = '6px';

    const swatchEls: HTMLButtonElement[] = [];
    for (let i = 0; i < MATTE_PALETTE.length; i++) {
      const c = MATTE_PALETTE[i]!;
      const b = document.createElement('button');
      b.type = 'button';
      b.title = c.name;
      b.setAttribute('aria-label', c.name);
      b.setAttribute('aria-pressed', i === 0 ? 'true' : 'false');
      b.style.cssText =
        'height:34px;border-radius:5px;border:1px solid var(--mx-line);cursor:pointer;padding:0;' +
        (c.kind === 'bars'
          ? 'background:linear-gradient(90deg,#fff 0 12.5%,#ff0 12.5% 25%,#0ff 25% 37.5%,#0f0 37.5% 50%,#f0f 50% 62.5%,#f00 62.5% 75%,#00f 75% 87.5%,#000 87.5%);'
          : `background:${srgb(c.rgb)};`);
      b.addEventListener('click', () => {
        state.colorIndex = i;
        for (let j = 0; j < swatchEls.length; j++) swatchEls[j]!.setAttribute('aria-pressed', j === i ? 'true' : 'false');
        draw();
      });
      swatchEls.push(b);
      swatches.appendChild(b);
    }

    const levelCtl = range({
      min: 0,
      max: 1,
      step: 0.01,
      value: 1,
      label: 'Matte LEVEL',
      onInput: (v) => {
        state.level = v;
        draw();
      },
    });

    const gradBtn = toggle('Gradation', false, (on) => {
      state.gradation = on;
      draw();
    });

    const cycle = (dir: number): HTMLButtonElement => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'mx-btn';
      b.textContent = dir > 0 ? 'SELECT ▲' : 'SELECT ▼';
      b.addEventListener('click', () => {
        const n = MATTE_PALETTE.length;
        state.colorIndex = (((state.colorIndex + dir) % n) + n) % n;
        for (let j = 0; j < swatchEls.length; j++)
          swatchEls[j]!.setAttribute('aria-pressed', j === state.colorIndex ? 'true' : 'false');
        draw();
      });
      return b;
    };

    const draw = (): void => {
      ctx.clearRect(0, 0, w, h);
      const bars = isColourBar(state.colorIndex);

      for (let y = 0; y < h; y++) {
        const intensity = matteIntensityAtY(state, y / h);
        if (bars) {
          const bw = w / BARS.length;
          for (let i = 0; i < BARS.length; i++) {
            const c = BARS[i]!;
            ctx.fillStyle = srgb([c[0] * intensity, c[1] * intensity, c[2] * intensity]);
            ctx.fillRect(i * bw, y, bw + 1, 1);
          }
        } else {
          const flat = matteFlatColor({ ...state, level: 1 });
          const scale = intensity / Math.max(state.level, 1e-6);
          const lit = matteFlatColor(state);
          ctx.fillStyle = srgb([lit[0] * scale, lit[1] * scale, lit[2] * scale]);
          void flat;
          ctx.fillRect(0, y, w, 1);
        }
      }

      ctx.strokeStyle = token('--mx-line');
      ctx.lineWidth = 1;
      ctx.strokeRect(0.5, 0.5, w - 1, h - 1);

      const affects = levelAffectsOutput(state.colorIndex);
      info.innerHTML =
        `<div class="mx-row" style="gap:10px;margin-bottom:12px">
          <div class="mx-readout">${matteColorName(state.colorIndex).toUpperCase()}</div>
          <div class="mx-readout muted">index ${state.colorIndex}</div>
        </div>` +
        kv('Kind', `<code>${matteColorAt(state.colorIndex).kind}</code>`) +
        kv(
          'LEVEL',
          affects
            ? matteColorAt(state.colorIndex).kind === 'white'
              ? `adjusts <strong>brightness</strong> → ${matteBrightness(state).toFixed(2)}`
              : `adjusts <strong>chroma</strong> → ${matteChroma(state).toFixed(2)}`
            : 'ignored by this colour',
        ) +
        kv('Gradation', state.gradation ? 'ramps top (least intense) → bottom (set level)' : 'off — flat matte');
    };

    const controls = document.createElement('div');
    controls.className = 'mx-row';
    controls.style.marginTop = '12px';
    controls.appendChild(cycle(1));
    controls.appendChild(cycle(-1));
    controls.appendChild(gradBtn);

    this.appendChild(swatches);
    this.appendChild(controls);
    const lf = field('LEVEL', levelCtl);
    lf.style.marginTop = '12px';
    this.appendChild(lf);
    const cw = document.createElement('div');
    cw.style.marginTop = '14px';
    cw.appendChild(canvas);
    this.appendChild(cw);
    this.appendChild(info);
    this.appendChild(
      caption(
        'Palette, level semantics and the gradient ramp come from <code>MATTE_PALETTE</code>, ' +
          '<code>levelAffectsOutput</code>, <code>matteFlatColor</code> and <code>matteIntensityAtY</code> ' +
          'in <code>src/core/matte.ts</code>.',
      ),
    );
    draw();
  }
}

function kv(k: string, v: string): string {
  return `<div style="display:flex;gap:14px;padding:6px 0;border-bottom:1px solid var(--mx-line)">
    <span class="mx-label" style="min-width:9rem">${k}</span><span>${v}</span></div>`;
}

defineDemo('mx-demo-matte', MattePalette);
