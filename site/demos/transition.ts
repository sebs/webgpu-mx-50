// D5 — transition rules. Which composite rule each transition type selects, the
// cross-dissolve weights at the current lever, and where NAM's dominance sits.

import { mixWeights, compositeRule, namDominant, combineMode } from '../../src/core/transition.js';
import type { TransitionType } from '../../src/state/state.js';
import { DemoElement, defineDemo, range, field, canvas2d, token, caption } from './base.js';

const TYPES: readonly TransitionType[] = ['mix', 'nam', 'wipe', 'lum-key', 'chroma-key'];
const TYPE_LABEL: Record<string, string> = {
  mix: 'MIX',
  nam: 'NAM',
  wipe: 'WIPE',
  'lum-key': 'LUM KEY',
  'chroma-key': 'CHROMA KEY',
};

class TransitionRules extends DemoElement {
  protected render(): void {
    let lever = 0.35;
    let type: TransitionType = 'mix';

    const { canvas, ctx, w, h } = canvas2d(520, 170);
    const out = document.createElement('div');
    out.style.marginTop = '12px';

    const buttons = document.createElement('div');
    buttons.className = 'mx-row';
    const btns: HTMLButtonElement[] = [];
    for (let i = 0; i < TYPES.length; i++) {
      const t = TYPES[i]!;
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'mx-btn';
      b.setAttribute('aria-pressed', t === type ? 'true' : 'false');
      b.innerHTML = `<span class="led" aria-hidden="true"></span><span>${TYPE_LABEL[t]}</span>`;
      b.addEventListener('click', () => {
        type = t;
        for (let j = 0; j < btns.length; j++) btns[j]!.setAttribute('aria-pressed', TYPES[j] === t ? 'true' : 'false');
        draw();
      });
      btns.push(b);
      buttons.appendChild(b);
    }

    const leverCtl = range({
      min: 0,
      max: 1,
      step: 0.005,
      value: lever,
      label: 'Mix/Wipe lever',
      onInput: (v) => {
        lever = v;
        draw();
      },
    });

    const draw = (): void => {
      const wts = mixWeights(lever);
      const rule = compositeRule(type);

      ctx.clearRect(0, 0, w, h);
      const padX = 34;
      const padY = 22;
      const gw = w - padX * 2;
      const gh = h - padY * 2;

      // axes
      ctx.strokeStyle = token('--mx-line');
      ctx.lineWidth = 1;
      ctx.strokeRect(padX + 0.5, padY + 0.5, gw - 1, gh - 1);
      ctx.setLineDash([3, 4]);
      ctx.beginPath();
      ctx.moveTo(padX + gw / 2, padY);
      ctx.lineTo(padX + gw / 2, padY + gh);
      ctx.stroke();
      ctx.setLineDash([]);

      // weight curves (they always sum to 1 — that is the point)
      const drawCurve = (f: (x: number) => number, colour: string): void => {
        ctx.strokeStyle = colour;
        ctx.lineWidth = 2;
        ctx.beginPath();
        for (let i = 0; i <= 100; i++) {
          const x = i / 100;
          const y = f(x);
          const px = padX + x * gw;
          const py = padY + gh - y * gh;
          if (i === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.stroke();
      };
      drawCurve((x) => mixWeights(x).a, token('--mx-label'));
      drawCurve((x) => mixWeights(x).b, token('--mx-amber'));

      // lever marker
      const lx = padX + lever * gw;
      ctx.strokeStyle = token('--mx-red');
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(lx, padY);
      ctx.lineTo(lx, padY + gh);
      ctx.stroke();

      ctx.font = '500 9px ui-monospace, monospace';
      ctx.fillStyle = token('--mx-label-dim');
      ctx.fillText('A', padX - 12, padY + 10);
      ctx.fillText('B', padX - 12, padY + gh);
      ctx.fillText('lever 0', padX, padY + gh + 14);
      ctx.textAlign = 'right';
      ctx.fillText('lever 1', padX + gw, padY + gh + 14);
      ctx.textAlign = 'left';

      const dominant = namDominant(lever);
      out.innerHTML =
        `<div class="mx-row" style="gap:10px;margin-bottom:12px">
           <div class="mx-readout">A ${wts.a.toFixed(3)}</div>
           <div class="mx-readout">B ${wts.b.toFixed(3)}</div>
           <div class="mx-readout muted">sum ${(wts.a + wts.b).toFixed(3)}</div>
         </div>` +
        kv('Composite rule', `<code>${rule}</code>`) +
        kv('Combine mode (shader uniform)', String(combineMode(rule))) +
        (type === 'nam'
          ? kv(
              'NAM dominance',
              dominant === 'balanced'
                ? 'balanced — the brighter pixel of the two wins outright'
                : `biased toward bus ${dominant}`,
            )
          : '') +
        (type === 'lum-key' || type === 'chroma-key'
          ? `<p class="mx-note" style="margin:12px 0 0">Keys are <em>transition modes</em> on this desk, not a
             separate block: the B-bus is always the key source and the A-bus the background, and the lever scales
             the keyed foreground's opacity.</p>`
          : '');
    };

    this.appendChild(buttons);
    const f = field('Mix/Wipe lever', leverCtl);
    f.style.marginTop = '12px';
    this.appendChild(f);
    const cw = document.createElement('div');
    cw.style.marginTop = '14px';
    cw.appendChild(canvas);
    this.appendChild(cw);
    this.appendChild(out);
    this.appendChild(
      caption(
        'Curves and readouts from <code>mixWeights</code>, <code>compositeRule</code>, ' +
          '<code>namDominant</code> and <code>combineMode</code> in <code>src/core/transition.ts</code>.',
      ),
    );
    draw();
  }
}

function kv(k: string, v: string): string {
  return `<div style="display:flex;gap:14px;padding:6px 0;border-bottom:1px solid var(--mx-line)">
    <span class="mx-label" style="min-width:14rem">${k}</span><span>${v}</span></div>`;
}

defineDemo('mx-demo-transition', TransitionRules);
