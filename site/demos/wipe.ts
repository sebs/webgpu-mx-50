// D2 — Wipe pattern dialer, and D3 — Wipe geometry scope.
//
// Both call src/core/wipe.ts directly. Nothing here reimplements the numbering scheme or
// the reveal geometry: the readouts you see are the shipping oracle answering.

import {
  WIPE_FAMILIES,
  VARIANT_COUNT,
  REVERSE_OFFSET,
  RS422_MAX,
  forwardIndex,
  numberToPattern,
  isReversed,
  forwardNumber,
  agA800Call,
  rs422Addressable,
  blindsLegal,
  squareShapeName,
  revealRect,
  revealAnchors,
  compressionAffine,
  slideAffine,
  outgoingSlideAffine,
  blindsAxes,
  BLINDS_STRIPS,
} from '../../src/core/wipe.js';
import type { WipeFamily } from '../../src/state/state.js';
import { DemoElement, defineDemo, field, range, canvas2d, token, caption, row, toggle, pad } from './base.js';

const FORWARD_MAX = WIPE_FAMILIES.length * VARIANT_COUNT; // 7 × 4 = 28

// ---------------------------------------------------------------- D2 dialer

/**
 * Type a number 1–255; the oracle answers. Numbers outside the modelled forward space
 * (1–28) and its reversals (129–156) get an explicit "outside the pattern space" readout
 * rather than a fabricated answer — `numberToPattern` throws there, and saying so is a
 * true statement about the model.
 */
class WipeDialer extends DemoElement {
  protected render(): void {
    const input = document.createElement('input');
    input.type = 'number';
    input.className = 'mx-input';
    input.min = '1';
    input.max = String(RS422_MAX);
    input.value = '1';
    input.style.width = '7rem';
    input.setAttribute('aria-label', 'Wipe pattern number, 1 to 255');

    const out = document.createElement('div');
    out.style.marginTop = '14px';

    const stepper = (delta: number): HTMLButtonElement => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'mx-btn';
      b.textContent = delta > 0 ? '+1' : '−1';
      b.addEventListener('click', () => {
        const n = Math.min(RS422_MAX, Math.max(1, Number(input.value || '1') + delta));
        input.value = String(n);
        update();
      });
      return b;
    };

    const presets = document.createElement('div');
    presets.className = 'mx-row';
    presets.style.marginTop = '10px';
    const quick: Array<[string, number]> = [
      ['001 plain', 1],
      ['028 last', FORWARD_MAX],
      ['129 rev', REVERSE_OFFSET + 1],
      ['099 A800', 99],
      ['200 ?', 200],
    ];
    for (let i = 0; i < quick.length; i++) {
      const [label, n] = quick[i]!;
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'mx-btn';
      b.textContent = label;
      b.addEventListener('click', () => {
        input.value = String(n);
        update();
      });
      presets.appendChild(b);
    }

    const update = (): void => {
      const n = Math.round(Number(input.value || '0'));
      const rows: string[] = [];

      const addressable = rs422Addressable(n);
      const forward = forwardNumber(n);
      const inSpace = addressable && forward >= 1 && forward <= FORWARD_MAX;

      if (inSpace) {
        const p = numberToPattern(n);
        const shape = p.family === 'square' ? ` <span class="mx-dim">(${squareShapeName(p.variant)})</span>` : '';
        rows.push(kv('Family', `${p.family}${shape}`));
        rows.push(kv('Variant', `${p.variant + 1} of ${VARIANT_COUNT}`));
        rows.push(kv('Direction', p.reverse ? 'REVERSE' : 'forward'));
        rows.push(kv('Round-trips to', String(forwardIndex(p.family, p.variant) + (p.reverse ? REVERSE_OFFSET : 0))));
        rows.push(kv('Blinds legal', blindsLegal(p.family) ? 'yes' : 'no — rejected on this family'));
      } else {
        rows.push(
          `<p class="mx-note" style="margin:0 0 12px">Outside the modelled pattern space. The engine composes
           <strong>${WIPE_FAMILIES.length} families × ${VARIANT_COUNT} variants = ${FORWARD_MAX}</strong> forward
           patterns (1–${FORWARD_MAX}) plus their reversals (${REVERSE_OFFSET + 1}–${REVERSE_OFFSET + FORWARD_MAX});
           <code>numberToPattern</code> throws for anything else rather than inventing a pattern.</p>`,
        );
        if (addressable) rows.push(kv('Reverse bit', isReversed(n) ? `set (forward part ${forward})` : 'clear'));
      }

      rows.push(kv('RS-422 addressable', addressable ? `yes (001–${RS422_MAX})` : `no — outside 001–${RS422_MAX}`));
      const call = agA800Call(n);
      rows.push(
        kv(
          'AG-A800 call',
          call.kind === 'current'
            ? 'triggers whatever is currently set up'
            : call.kind === 'pattern'
              ? `pattern ${pad(call.number, 2)}`
              : 'invalid — the controller reaches 01–99 only',
        ),
      );

      out.innerHTML = `<div class="mx-readout big" style="margin-bottom:12px">${pad(Math.max(n, 0), 3)}</div>` + rows.join('');
    };

    input.addEventListener('input', update);

    this.appendChild(row(field('Pattern number', input), stepper(-1), stepper(1)));
    this.appendChild(presets);
    this.appendChild(out);
    this.appendChild(
      caption(
        'Calls <code>numberToPattern</code>, <code>forwardIndex</code>, <code>agA800Call</code> and ' +
          '<code>rs422Addressable</code> from <code>src/core/wipe.ts</code> — the same oracle the mixer uses.',
      ),
    );
    update();
  }
}

function kv(k: string, v: string): string {
  return `<div style="display:flex;gap:14px;padding:6px 0;border-bottom:1px solid var(--mx-line)">
    <span class="mx-label" style="min-width:11rem">${k}</span><span>${v}</span></div>`;
}

// ---------------------------------------------------------------- D3 geometry scope

/**
 * Draws what the wipe shader is told, not a picture of a wipe: the reveal rect for the
 * chosen family/variant at the current lever position, the per-axis anchors, and the
 * affine remap that Compression or Slide applies to the incoming frame.
 */
class WipeScope extends DemoElement {
  protected render(): void {
    let family: WipeFamily = 'straight';
    let variant = 0;
    let progress = 0.45;
    let mode: 'plain' | 'compression' | 'slide' = 'plain';
    let blinds = false;
    let aspect = 0;

    const { canvas, ctx, w, h } = canvas2d(520, 300);
    const info = document.createElement('div');
    info.style.marginTop = '12px';

    const famSel = document.createElement('select');
    famSel.className = 'mx-input';
    famSel.setAttribute('aria-label', 'Wipe family');
    for (let i = 0; i < WIPE_FAMILIES.length; i++) {
      const o = document.createElement('option');
      o.value = WIPE_FAMILIES[i]!;
      o.textContent = WIPE_FAMILIES[i]!;
      famSel.appendChild(o);
    }
    famSel.addEventListener('change', () => {
      family = famSel.value as WipeFamily;
      draw();
    });

    const varSel = document.createElement('select');
    varSel.className = 'mx-input';
    varSel.setAttribute('aria-label', 'Variant');
    for (let i = 0; i < VARIANT_COUNT; i++) {
      const o = document.createElement('option');
      o.value = String(i);
      o.textContent = `Variant ${i + 1}`;
      varSel.appendChild(o);
    }
    varSel.addEventListener('change', () => {
      variant = Number(varSel.value);
      draw();
    });

    const modeSel = document.createElement('select');
    modeSel.className = 'mx-input';
    modeSel.setAttribute('aria-label', 'Modifier');
    const modes: Array<[string, string]> = [
      ['plain', 'Plain wipe'],
      ['compression', 'Compression'],
      ['slide', 'Slide'],
    ];
    for (let i = 0; i < modes.length; i++) {
      const o = document.createElement('option');
      o.value = modes[i]![0];
      o.textContent = modes[i]![1];
      modeSel.appendChild(o);
    }
    modeSel.addEventListener('change', () => {
      mode = modeSel.value as 'plain' | 'compression' | 'slide';
      draw();
    });

    const lever = range({
      min: 0,
      max: 1,
      step: 0.005,
      value: progress,
      label: 'Mix/Wipe lever position',
      onInput: (v) => {
        progress = v;
        draw();
      },
    });

    const aspectCtl = range({
      min: -0.9,
      max: 0.9,
      step: 0.01,
      value: 0,
      label: 'Aspect (Square family only)',
      onInput: (v) => {
        aspect = v;
        draw();
      },
    });

    const blindsBtn = toggle('Blinds', false, (on) => {
      blinds = on;
      draw();
    });

    const controls = document.createElement('div');
    controls.className = 'mx-grid cols-2';
    controls.style.gap = '12px';
    controls.appendChild(field('Family', famSel));
    controls.appendChild(field('Variant', varSel));
    controls.appendChild(field('Modifier', modeSel));
    controls.appendChild(field('Aspect', aspectCtl));
    controls.appendChild(field('Lever', lever));
    controls.appendChild(field('Modifier LED', blindsBtn));

    const draw = (): void => {
      const rect = revealRect(family, variant, progress, family === 'square' ? aspect : 0);
      const anchors = revealAnchors(family, variant);

      ctx.clearRect(0, 0, w, h);

      // Frame
      const pad0 = 26;
      const fw = w - pad0 * 2;
      const fh = h - pad0 * 2;
      const X = (u: number): number => pad0 + u * fw;
      const Y = (v: number): number => pad0 + v * fh;

      ctx.fillStyle = token('--mx-well');
      ctx.fillRect(pad0, pad0, fw, fh);

      // Outgoing hatch
      ctx.save();
      ctx.beginPath();
      ctx.rect(pad0, pad0, fw, fh);
      ctx.clip();
      ctx.strokeStyle = 'rgba(255,255,255,0.05)';
      ctx.lineWidth = 1;
      for (let i = -fh; i < fw; i += 10) {
        ctx.beginPath();
        ctx.moveTo(pad0 + i, pad0);
        ctx.lineTo(pad0 + i + fh, pad0 + fh);
        ctx.stroke();
      }
      ctx.restore();

      // Reveal rect (the incoming envelope)
      const amber = token('--mx-amber');
      ctx.save();
      ctx.beginPath();
      ctx.rect(X(rect.x0), Y(rect.y0), X(rect.x1) - X(rect.x0), Y(rect.y1) - Y(rect.y0));
      ctx.clip();
      ctx.fillStyle = 'rgba(242,162,60,0.14)';
      ctx.fillRect(pad0, pad0, fw, fh);

      // Blinds strips inside the reveal
      if (blinds && blindsLegal(family)) {
        const ax = blindsAxes(family, variant);
        ctx.fillStyle = 'rgba(242,162,60,0.20)';
        for (let s = 0; s < BLINDS_STRIPS; s++) {
          if (ax.x) {
            const sw = fw / BLINDS_STRIPS;
            ctx.fillRect(pad0 + s * sw, pad0, sw * 0.5, fh);
          }
          if (ax.y) {
            const sh = fh / BLINDS_STRIPS;
            ctx.fillRect(pad0, pad0 + s * sh, fw, sh * 0.5);
          }
        }
      }
      ctx.restore();

      ctx.strokeStyle = amber;
      ctx.lineWidth = 2;
      ctx.strokeRect(X(rect.x0), Y(rect.y0), X(rect.x1) - X(rect.x0), Y(rect.y1) - Y(rect.y0));

      // The affine, drawn as where the source frame's corners land
      let affineLabel = 'identity — the incoming frame is cropped, not remapped';
      if (mode === 'compression') {
        const a = compressionAffine(rect);
        drawAffineGrid(ctx, X, Y, a, amber);
        affineLabel = `sample = uv × (${a.sx.toFixed(2)}, ${a.sy.toFixed(2)}) + (${a.ox.toFixed(2)}, ${a.oy.toFixed(2)})`;
      } else if (mode === 'slide') {
        const a = slideAffine(anchors, rect);
        drawAffineGrid(ctx, X, Y, a, amber);
        const o = outgoingSlideAffine(anchors, rect);
        affineLabel =
          `incoming: uv × (${a.sx.toFixed(2)}, ${a.sy.toFixed(2)}) + (${a.ox.toFixed(2)}, ${a.oy.toFixed(2)})` +
          ` · outgoing: +(${o.ox.toFixed(2)}, ${o.oy.toFixed(2)})`;
      }

      // Frame border
      ctx.strokeStyle = token('--mx-line');
      ctx.lineWidth = 1;
      ctx.strokeRect(pad0 + 0.5, pad0 + 0.5, fw - 1, fh - 1);

      // Labels
      ctx.fillStyle = token('--mx-label-dim');
      ctx.font = '500 9px ui-monospace, monospace';
      ctx.fillText('A (outgoing)', pad0, pad0 - 9);
      ctx.textAlign = 'right';
      ctx.fillStyle = amber;
      ctx.fillText('B (incoming)', pad0 + fw, pad0 - 9);
      ctx.textAlign = 'left';

      info.innerHTML =
        kv('Reveal rect', `x ${rect.x0.toFixed(3)} → ${rect.x1.toFixed(3)} · y ${rect.y0.toFixed(3)} → ${rect.y1.toFixed(3)}`) +
        kv('Anchors', `x: ${anchors.x} · y: ${anchors.y}`) +
        kv('Sample remap', affineLabel) +
        (blinds && !blindsLegal(family)
          ? `<p class="mx-note" style="margin:12px 0 0">Blinds is rejected on <code>${family}</code> — legal only on
             straight, corner, diagonal, triangle and split (<code>blindsLegal</code>).</p>`
          : '');
    };

    this.appendChild(controls);
    const cw = document.createElement('div');
    cw.style.marginTop = '14px';
    cw.appendChild(canvas);
    this.appendChild(cw);
    this.appendChild(info);
    this.appendChild(
      caption(
        'Every number above comes from <code>revealRect</code>, <code>revealAnchors</code>, ' +
          '<code>compressionAffine</code>, <code>slideAffine</code> and <code>blindsAxes</code> — the same values ' +
          'handed to the WGSL each frame. No GPU required to see them.',
      ),
    );
    draw();
  }
}

function drawAffineGrid(
  ctx: CanvasRenderingContext2D,
  X: (u: number) => number,
  Y: (v: number) => number,
  a: { sx: number; sy: number; ox: number; oy: number },
  colour: string,
): void {
  // sample = uv*s + o  ⇒  the source frame occupies uv ∈ [-o/s, (1-o)/s]
  const u0 = -a.ox / a.sx;
  const u1 = (1 - a.ox) / a.sx;
  const v0 = -a.oy / a.sy;
  const v1 = (1 - a.oy) / a.sy;
  ctx.save();
  ctx.setLineDash([4, 3]);
  ctx.strokeStyle = colour;
  ctx.globalAlpha = 0.8;
  ctx.lineWidth = 1.5;
  ctx.strokeRect(X(u0), Y(v0), X(u1) - X(u0), Y(v1) - Y(v0));
  ctx.setLineDash([]);
  ctx.globalAlpha = 0.35;
  for (let i = 1; i < 4; i++) {
    const t = i / 4;
    ctx.beginPath();
    ctx.moveTo(X(u0 + (u1 - u0) * t), Y(v0));
    ctx.lineTo(X(u0 + (u1 - u0) * t), Y(v1));
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(X(u0), Y(v0 + (v1 - v0) * t));
    ctx.lineTo(X(u1), Y(v0 + (v1 - v0) * t));
    ctx.stroke();
  }
  ctx.restore();
}

defineDemo('mx-demo-wipe-dialer', WipeDialer);
defineDemo('mx-demo-wipe-scope', WipeScope);
