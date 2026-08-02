// D6b — Trail geometry (reference §8.8, ADR-0007).
//
// The trail accumulator on the GPU is a ping-pong buffer, but the geometry it bakes is
// pure: a compressed live lead anchored at a joystick-chosen upper corner, with older
// copies nesting outward and ageing toward the drop floor. All of that is computable —
// and therefore showable — with no GPU at all.

import {
  TRAIL_MAX_COPIES,
  TRAIL_MIN_SCALE,
  TRAIL_DECAY,
  TRAIL_AGE_FLOOR,
  TRAIL_BAKE_OPACITY,
  trailStep,
  trailScale,
  trailCopyRect,
  trailVisibleCopies,
  trailCopyWeight,
  trailInterval,
  intervalTicks,
  strobeInterval,
  multiInterval,
  multiTilesPerAxis,
  multiGridLabel,
  paintCoarseness,
} from '../../src/core/digital-effect.js';
import type { TrailCorner } from '../../src/core/digital-effect.js';
import { DemoElement, defineDemo, range, field, canvas2d, token, caption, button, row, readout } from './base.js';

class TrailGeometry extends DemoElement {
  protected render(): void {
    let spawnCount = 6;
    let corner: TrailCorner = 'upper-left';
    let timePos = 0.35;

    const { canvas, ctx, w, h } = canvas2d(420, 260);
    const info = document.createElement('div');
    info.style.marginTop = '12px';

    const spawnCtl = range({
      min: 0,
      max: TRAIL_MAX_COPIES + 4,
      step: 1,
      value: spawnCount,
      label: 'Spawn count',
      onInput: (v) => {
        spawnCount = v;
        draw();
      },
    });

    const timeCtl = range({
      min: 0,
      max: 1,
      step: 0.01,
      value: timePos,
      label: 'TIME control position',
      onInput: (v) => {
        timePos = v;
        draw();
      },
    });

    const cornerBtn = button('Corner: upper-left', () => {
      corner = corner === 'upper-left' ? 'upper-right' : 'upper-left';
      cornerBtn.textContent = `Corner: ${corner}`;
      draw();
    });

    const draw = (): void => {
      ctx.clearRect(0, 0, w, h);
      const pad0 = 16;
      const fw = w - pad0 * 2;
      const fh = h - pad0 * 2;

      ctx.fillStyle = token('--mx-well');
      ctx.fillRect(pad0, pad0, fw, fh);

      const visible = trailVisibleCopies(spawnCount);
      const amber = token('--mx-amber');

      // Oldest (largest) first so the live lead ends up on top.
      for (let age = visible - 1; age >= 0; age--) {
        const step = trailStep(spawnCount - age);
        const rect = trailCopyRect(step, corner);
        const weight = trailCopyWeight(age);
        ctx.globalAlpha = Math.max(weight * TRAIL_BAKE_OPACITY, 0.02);
        ctx.fillStyle = amber;
        ctx.fillRect(pad0 + rect.x * fw, pad0 + rect.y * fh, rect.width * fw, rect.height * fh);
        ctx.globalAlpha = Math.min(1, weight + 0.25);
        ctx.strokeStyle = amber;
        ctx.lineWidth = 1;
        ctx.strokeRect(pad0 + rect.x * fw, pad0 + rect.y * fh, rect.width * fw, rect.height * fh);
      }
      ctx.globalAlpha = 1;

      // The live lead
      const leadRect = trailCopyRect(trailStep(spawnCount), corner);
      ctx.strokeStyle = token('--mx-red');
      ctx.lineWidth = 2;
      ctx.strokeRect(pad0 + leadRect.x * fw, pad0 + leadRect.y * fh, leadRect.width * fw, leadRect.height * fh);

      ctx.strokeStyle = token('--mx-line');
      ctx.lineWidth = 1;
      ctx.strokeRect(pad0 + 0.5, pad0 + 0.5, fw - 1, fh - 1);

      const seconds = trailInterval(timePos);
      info.innerHTML =
        `<div class="mx-row" style="gap:10px;margin-bottom:12px">
          <div class="mx-readout">copies ${visible} / ${TRAIL_MAX_COPIES}</div>
          <div class="mx-readout">lead scale ${trailScale(trailStep(spawnCount)).toFixed(3)}</div>
          <div class="mx-readout muted">oldest weight ${trailCopyWeight(visible - 1 < 0 ? 0 : visible - 1).toFixed(4)}</div>
        </div>` +
        kv('Interval', `${seconds.toFixed(3)} s → ${intervalTicks(seconds)} logical ticks`) +
        kv('Shrink floor', `${TRAIL_MIN_SCALE} at step ${TRAIL_MAX_COPIES - 1}, then held`) +
        kv('Per-spawn decay', `${TRAIL_DECAY.toFixed(4)} — reaches the ${TRAIL_AGE_FLOOR} drop floor after exactly ${TRAIL_MAX_COPIES} spawns`);
    };

    this.appendChild(row(cornerBtn));
    const f1 = field('Spawn count (drag past 16 — the cap holds)', spawnCtl);
    f1.style.marginTop = '12px';
    this.appendChild(f1);
    const f2 = field('TIME', timeCtl);
    f2.style.marginTop = '12px';
    this.appendChild(f2);
    const cw = document.createElement('div');
    cw.style.marginTop = '14px';
    cw.appendChild(canvas);
    this.appendChild(cw);
    this.appendChild(info);
    this.appendChild(
      caption(
        'Rectangles from <code>trailCopyRect</code>, opacity from <code>trailCopyWeight</code>, cap from ' +
          '<code>trailVisibleCopies</code> — <code>src/core/digital-effect.ts</code>, the same functions the ' +
          'ping-pong accumulator in <code>gpu/trail.ts</code> consumes.',
      ),
    );
    draw();
  }
}

/**
 * A small companion readout for the rest of the effect block's pure numbers: the TIME
 * control's interval mapping per effect, the Multi grid ladder, and Paint's coarseness
 * bands. Cheap to render, and it makes the "the domain is complete" claim concrete.
 */
class EffectNumbers extends DemoElement {
  protected render(): void {
    let pos = 0.5;
    const out = document.createElement('div');

    const ctl = range({
      min: 0,
      max: 1,
      step: 0.01,
      value: pos,
      label: 'Control position',
      onInput: (v) => {
        pos = v;
        paint();
      },
    });

    const paint = (): void => {
      const grid = [1, 4, 9, 16];
      const gridRows: string[] = [];
      for (let i = 0; i < grid.length; i++) {
        const n = grid[i]!;
        gridRows.push(
          `<tr><td>${multiGridLabel(n)}</td><td>${multiTilesPerAxis(n)} × ${multiTilesPerAxis(n)}</td></tr>`,
        );
      }
      out.innerHTML =
        `<div class="mx-row" style="gap:10px;margin:12px 0">
           <div class="mx-readout">strobe ${strobeInterval(pos).toFixed(3)} s</div>
           <div class="mx-readout">multi ${multiInterval(pos).toFixed(3)} s</div>
           <div class="mx-readout">trail ${trailInterval(pos).toFixed(3)} s</div>
         </div>` +
        `<p style="margin:0 0 10px">Paint at this LEVEL is <strong>${paintCoarseness(pos)}</strong>.</p>` +
        `<div class="mx-tablewrap"><table class="mx-table"><thead><tr><th>Multi press</th><th>Grid</th></tr></thead>` +
        `<tbody>${gridRows.join('')}</tbody></table></div>`;
    };

    this.appendChild(field('TIME / LEVEL control position', ctl));
    this.appendChild(out);
    this.appendChild(
      caption(
        'From <code>strobeInterval</code>, <code>multiInterval</code>, <code>trailInterval</code>, ' +
          '<code>paintCoarseness</code>, <code>multiGridLabel</code> and <code>multiTilesPerAxis</code>.',
      ),
    );
    paint();
    void readout;
  }
}

function kv(k: string, v: string): string {
  return `<div style="display:flex;gap:14px;padding:6px 0;border-bottom:1px solid var(--mx-line)">
    <span class="mx-label" style="min-width:10rem">${k}</span><span>${v}</span></div>`;
}

defineDemo('mx-demo-trail', TrailGeometry);
defineDemo('mx-demo-effect-numbers', EffectNumbers);
