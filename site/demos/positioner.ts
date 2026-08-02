// D20 — Positioner & Scene Grabber (the hardware's B-5 block).
//
// The Positioner engages only on Square-family wipes; the lever sizes the inset, the
// joystick places it, and SCENE GRABBER freezes the pixels inside it so the still can then
// be moved independently of the live video. All of that placement math is pure.

import { PanelStore } from '../../src/state/store.js';
import { FACTORY_PRESET } from '../../src/state/state.js';
import {
  positionerAvailable,
  aspectEffective,
  isPictureInPicture,
  insetCentre,
  effectiveInsetSize,
  insetHalf,
  INSET_TRAVEL,
  INSET_MIN_SIZE,
} from '../../src/core/positioner.js';
import { WIPE_FAMILIES } from '../../src/core/wipe.js';
import type { WipeFamily } from '../../src/state/state.js';
import { DemoElement, defineDemo, range, field, canvas2d, token, caption, button } from './base.js';

class PositionerScope extends DemoElement {
  protected render(): void {
    const store = new PanelStore(FACTORY_PRESET);
    store.dispatch({ type: 'PRESS_WIPE_FAMILY', family: 'square' });

    const { canvas, ctx, w, h } = canvas2d(440, 250);
    const info = document.createElement('div');
    info.style.marginTop = '12px';

    const famSel = document.createElement('select');
    famSel.className = 'mx-input';
    famSel.setAttribute('aria-label', 'Wipe family');
    for (let i = 0; i < WIPE_FAMILIES.length; i++) {
      const o = document.createElement('option');
      o.value = WIPE_FAMILIES[i]!;
      o.textContent = WIPE_FAMILIES[i]!;
      if (WIPE_FAMILIES[i] === 'square') o.selected = true;
      famSel.appendChild(o);
    }
    famSel.addEventListener('change', () =>
      store.dispatch({ type: 'PRESS_WIPE_FAMILY', family: famSel.value as WipeFamily }),
    );

    const posBtn = button('POSITIONER', () => store.dispatch({ type: 'PRESS_POSITIONER' }));
    const grabBtn = button('SCENE GRABBER', () => store.dispatch({ type: 'PRESS_SCENE_GRABBER' }));
    const aspectBtn = button('ASPECT ON', () => {
      const s = store.getSnapshot();
      store.dispatch({ type: 'SET_ASPECT_ON', on: !s.transition.wipe.aspectOn });
    });

    const leverCtl = range({
      min: 0, max: 1, step: 0.005, value: 0,
      label: 'Mix/Wipe lever (sizes the inset)',
      onInput: (v) => store.dispatch({ type: 'SET_LEVER', position: v }),
    });
    const sizeCtl = range({
      min: 0, max: 1, step: 0.005, value: 0.5,
      label: 'Positioner size',
      onInput: (v) => store.dispatch({ type: 'SET_POSITIONER_SIZE', value: v }),
    });
    const xCtl = range({
      min: -1, max: 1, step: 0.01, value: 0,
      label: 'Joystick X',
      onInput: (v) => {
        const s = store.getSnapshot();
        store.dispatch({ type: 'SET_POSITIONER_JOYSTICK', x: v, y: s.positioner.y });
      },
    });
    const yCtl = range({
      min: -1, max: 1, step: 0.01, value: 0,
      label: 'Joystick Y',
      onInput: (v) => {
        const s = store.getSnapshot();
        store.dispatch({ type: 'SET_POSITIONER_JOYSTICK', x: s.positioner.x, y: v });
      },
    });

    const draw = (): void => {
      const s = store.getSnapshot();
      const p = s.positioner;
      const family = s.transition.wipe.family;
      const available = positionerAvailable(family);

      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = 'rgba(139,143,163,0.16)';
      ctx.fillRect(0, 0, w, h);

      // Grid — the joystick pad idiom from the console's frame-mode joystick.
      ctx.strokeStyle = 'rgba(255,255,255,0.05)';
      ctx.lineWidth = 1;
      for (let i = 1; i < 8; i++) {
        ctx.beginPath();
        ctx.moveTo((i / 8) * w, 0);
        ctx.lineTo((i / 8) * w, h);
        ctx.stroke();
      }
      for (let i = 1; i < 5; i++) {
        ctx.beginPath();
        ctx.moveTo(0, (i / 5) * h);
        ctx.lineTo(w, (i / 5) * h);
        ctx.stroke();
      }

      if (p.on) {
        const centre = insetCentre(p.x, p.y);
        const size = effectiveInsetSize(p.size, s.transition.lever);
        const half = insetHalf(size);
        const cx = centre.u * w;
        const cy = centre.v * h;
        const hx = half * w;
        const hy = half * h;

        ctx.fillStyle = p.sceneGrabber ? token('--mx-green') : token('--mx-amber');
        ctx.globalAlpha = p.sceneGrabber ? 0.5 : 0.35;
        ctx.fillRect(cx - hx, cy - hy, hx * 2, hy * 2);
        ctx.globalAlpha = 1;
        ctx.strokeStyle = p.sceneGrabber ? token('--mx-green') : token('--mx-amber');
        ctx.lineWidth = 2;
        ctx.strokeRect(cx - hx, cy - hy, hx * 2, hy * 2);

        ctx.fillStyle = token('--mx-text');
        ctx.font = '500 9px ui-monospace, monospace';
        ctx.fillText(p.sceneGrabber ? 'GRABBED STILL' : 'B (live inset)', cx - hx + 6, cy - hy + 14);
      }

      ctx.strokeStyle = token('--mx-line');
      ctx.lineWidth = 1;
      ctx.strokeRect(0.5, 0.5, w - 1, h - 1);

      posBtn.classList.toggle('on', p.on);
      grabBtn.classList.toggle('on', p.sceneGrabber);
      aspectBtn.classList.toggle('on', s.transition.wipe.aspectOn);
      famSel.value = family;
      leverCtl.value = String(s.transition.lever);
      sizeCtl.value = String(p.size);
      xCtl.value = String(p.x);
      yCtl.value = String(p.y);

      const centre = insetCentre(p.x, p.y);
      info.innerHTML =
        `<div class="mx-row" style="gap:10px;margin-bottom:12px">
          <span class="mx-chip ${available ? 'ok' : ''}"><span class="led"></span>${available ? 'available on ' + family : 'unavailable on ' + family}</span>
          <span class="mx-chip ${p.on ? 'on' : ''}"><span class="led"></span>positioner ${p.on ? 'on' : 'off'}</span>
          <span class="mx-chip ${p.sceneGrabber ? 'ok' : ''}"><span class="led"></span>${p.sceneGrabber ? 'still grabbed' : 'live'}</span>
        </div>` +
        kv('Inset centre', `(${centre.u.toFixed(3)}, ${centre.v.toFixed(3)}) — joystick travel ±${INSET_TRAVEL}`) +
        kv('Effective size', `${effectiveInsetSize(p.size, s.transition.lever).toFixed(3)} (floor ${INSET_MIN_SIZE})`) +
        kv('ASPECT effective', aspectEffective(s.transition.wipe) ? 'yes — shapes the square' : 'no') +
        kv(
          'Storable as a PiP',
          isPictureInPicture(s)
            ? 'yes — a square-wipe inset can go to Event Memory'
            : '<span class="mx-dim">no — only a square-wipe PiP is storable</span>',
        ) +
        (!available && p.on
          ? `<p class="mx-note" style="margin:12px 0 0">Switching away from a Square-family pattern disengages the
             Positioner — the reducer enforces it, this demo cannot fake it.</p>`
          : '');
    };

    this.onDispose(store.subscribe(draw));

    const controls = document.createElement('div');
    controls.className = 'mx-row';
    controls.appendChild(posBtn);
    controls.appendChild(grabBtn);
    controls.appendChild(aspectBtn);

    const grid = document.createElement('div');
    grid.className = 'mx-grid cols-2';
    grid.style.gap = '12px';
    grid.style.marginTop = '12px';
    grid.appendChild(field('Wipe family', famSel));
    grid.appendChild(field('Lever', leverCtl));
    grid.appendChild(field('Size', sizeCtl));
    grid.appendChild(field('Joystick X', xCtl));
    grid.appendChild(field('Joystick Y', yCtl));

    this.appendChild(controls);
    this.appendChild(grid);
    const cw = document.createElement('div');
    cw.style.marginTop = '14px';
    cw.appendChild(canvas);
    this.appendChild(cw);
    this.appendChild(info);
    this.appendChild(
      caption(
        'Placement from <code>insetCentre</code>, <code>effectiveInsetSize</code> and <code>insetHalf</code>; ' +
          'availability and storability from <code>positionerAvailable</code> and <code>isPictureInPicture</code> ' +
          '(<code>src/core/positioner.ts</code>). Engagement goes through the reducer, so the Square-family rule ' +
          'is enforced, not imitated.',
      ),
    );
    draw();
  }
}

function kv(k: string, v: string): string {
  return `<div style="display:flex;gap:14px;padding:6px 0;border-bottom:1px solid var(--mx-line)">
    <span class="mx-label" style="min-width:11rem">${k}</span><span>${v}</span></div>`;
}

defineDemo('mx-demo-positioner', PositionerScope);
