// D12 — Event Memory (reference §13) and D17 — Special Modes (reference §16).
//
// Both run the real reducer. Event Memory in particular is the payoff of ADR-0011: because
// the panel is one JSON value, "store" is a copy and "recall" is an assignment, and the
// whole bank round-trips through a preset file with no bespoke serialisation.

import { PanelStore } from '../../src/state/store.js';
import { FACTORY_PRESET, EVENT_LED_STORE_BLINKS } from '../../src/state/state.js';
import { occupiedSlots, nextArmedSlot, stillKeyForSlot } from '../../src/core/event-memory.js';
import {
  SPECIAL_MACROS,
  macroFromButton,
  macroName,
  macroCharacter,
  macroNeedsLeverAtB,
  canRunMacro,
  shutterRevealShape,
  VIBRATE_FRAMES,
} from '../../src/core/special-mode.js';
import type { SpecialMacro } from '../../src/core/special-mode.js';
import { macroFrame } from '../../src/core/special-mode-geometry.js';
import { presetFileName, stampFromDate, exportFeedback, PRESET_MIME } from '../../src/persistence/preset-file.js';
import { DemoElement, defineDemo, button, caption, range, field, canvas2d, token, toggle, runWhileVisible, reducedMotion } from './base.js';
import { esc } from '../shell.js';

// ------------------------------------------------------------------ D12

class EventMemory extends DemoElement {
  protected render(): void {
    const store = new PanelStore(FACTORY_PRESET);
    let shift = false;

    const grid = document.createElement('div');
    grid.style.display = 'grid';
    grid.style.gridTemplateColumns = 'repeat(4, 1fr)';
    grid.style.gap = '8px';

    const slotBtns: HTMLButtonElement[] = [];
    for (let i = 0; i < 4; i++) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'mx-btn';
      b.style.justifyContent = 'center';
      b.innerHTML = `<span class="led" aria-hidden="true"></span><span data-n>EVENT ${i + 1}</span>`;
      b.addEventListener('click', () =>
        store.dispatch({ type: 'PRESS_EVENT_NO', button: i + 1, shift }),
      );
      slotBtns.push(b);
      grid.appendChild(b);
    }

    const memoryBtn = button('MEMORY (arm store)', () => store.dispatch({ type: 'PRESS_MEMORY' }));
    const shiftBtn = toggle('SHIFT (slots 5–8)', false, (on) => {
      shift = on;
      paint();
    });
    // The reducer never reads a clock (ADR-0012): the caller supplies the absolute tick.
    // A demo with no render loop can hand it a monotonic counter.
    let tick = 0;
    const takeBtn = button('AUTO TAKE (perform recall)', () => {
      tick += 1;
      store.dispatch({ type: 'PRESS_AUTO_TAKE', tick });
    });
    const mutateBtn = button('Change the panel', () => {
      const s = store.getSnapshot();
      store.dispatch({ type: 'ASSIGN_SOURCE', bus: 'A', source: ((s.busA.source === 4 ? 1 : Number(s.busA.source) + 1) as 1 | 2 | 3 | 4) });
      store.dispatch({ type: 'STEP_MATTE_COLOR', direction: 'up' });
      store.dispatch({ type: 'SET_LEVER', position: Math.random() });
    });
    const clearBtn = button('Clear all slots', () => store.dispatch({ type: 'CLEAR_ALL_SLOTS' }));

    const exportBtn = button('Export bank…', () => {
      const s = store.getSnapshot();
      const blob = new Blob([JSON.stringify({ version: 1, slots: s.memory.slots }, null, 2)], { type: PRESET_MIME });
      const name = presetFileName('bank', stampFromDate(new Date()));
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = name;
      a.click();
      URL.revokeObjectURL(a.href);
      status.textContent = exportFeedback('bank', name);
    });

    const status = document.createElement('p');
    status.className = 'mx-dim';
    status.style.cssText = 'margin:10px 0 0;font-size:13px;min-height:1.4em';

    const info = document.createElement('div');
    info.style.marginTop = '12px';

    const paint = (): void => {
      const s = store.getSnapshot();
      const mem = s.memory;
      const occupied = occupiedSlots(mem.slots);

      for (let i = 0; i < slotBtns.length; i++) {
        const slot = i + 1 + (shift ? 4 : 0);
        const filled = mem.slots[slot - 1] !== null && mem.slots[slot - 1] !== undefined;
        const b = slotBtns[i]!;
        (b.querySelector('[data-n]') as HTMLElement).textContent = `EVENT ${slot}`;
        b.setAttribute('aria-pressed', mem.armedSlot === slot ? 'true' : 'false');
        const led = b.querySelector('.led') as HTMLElement;
        led.style.background = filled ? 'var(--mx-green)' : 'var(--mx-led-off)';
        led.style.boxShadow = filled ? '0 0 8px var(--mx-green)' : 'none';
      }

      memoryBtn.classList.toggle('on', mem.memoryArmed);

      const occText: string[] = [];
      for (let i = 0; i < occupied.length; i++) occText.push(String(occupied[i]!));

      info.innerHTML =
        `<div class="mx-row" style="gap:10px;margin-bottom:12px">
           <div class="mx-readout">${occupied.length} / 8 stored</div>
           ${mem.memoryArmed ? '<span class="mx-chip on"><span class="led"></span>store armed</span>' : ''}
           ${mem.armedSlot !== null ? `<span class="mx-chip on"><span class="led"></span>slot ${mem.armedSlot} armed for recall</span>` : ''}
           ${mem.lastStoredSlot !== null ? `<span class="mx-chip ok"><span class="led"></span>stored to ${mem.lastStoredSlot} (${EVENT_LED_STORE_BLINKS} blinks)</span>` : ''}
         </div>` +
        kv('Occupied slots', occText.length ? occText.join(', ') : '<span class="mx-dim">none</span>') +
        kv(
          'Next in sequence',
          nextArmedSlot(mem.slots, mem.armedSlot ?? 0) === null
            ? '<span class="mx-dim">sequence ends — no further stored slot</span>'
            : String(nextArmedSlot(mem.slots, mem.armedSlot ?? 0)),
        ) +
        kv('Live panel', `bus A → ${String(s.busA.source)} · lever ${s.transition.lever.toFixed(2)} · matte ${s.matte.colorIndex}`) +
        kv('Still blob key for slot 1', `<code>${esc(stillKeyForSlot(1))}</code>`);
    };

    this.onDispose(store.subscribe(paint));

    const controls = document.createElement('div');
    controls.className = 'mx-row';
    controls.style.marginTop = '12px';
    controls.appendChild(memoryBtn);
    controls.appendChild(shiftBtn);
    controls.appendChild(takeBtn);

    const controls2 = document.createElement('div');
    controls2.className = 'mx-row';
    controls2.style.marginTop = '8px';
    controls2.appendChild(mutateBtn);
    controls2.appendChild(clearBtn);
    controls2.appendChild(exportBtn);

    this.appendChild(grid);
    this.appendChild(controls);
    this.appendChild(controls2);
    this.appendChild(status);
    this.appendChild(info);
    this.appendChild(
      caption(
        'Try: <em>MEMORY</em> then <em>EVENT 1</em> to store, <em>Change the panel</em>, then <em>EVENT 1</em> ' +
          'followed by <em>AUTO TAKE</em> to recall. Selecting an event arms it; AUTO TAKE performs it — and ' +
          'repeated presses walk the bank in numerical order, skipping empties (<code>nextArmedSlot</code>).',
      ),
    );
    paint();
  }
}

// ------------------------------------------------------------------ D17

class SpecialModes extends DemoElement {
  protected render(): void {
    let macro: SpecialMacro = SPECIAL_MACROS[0]!.id;
    let progress = 0.35;
    let auto = !reducedMotion();
    let joystickX = -1;
    let squareWipe = false;

    const { canvas, ctx, w, h } = canvas2d(420, 236);
    const info = document.createElement('div');
    info.style.marginTop = '12px';

    const bank = document.createElement('div');
    bank.style.display = 'grid';
    bank.style.gridTemplateColumns = 'repeat(4, 1fr)';
    bank.style.gap = '8px';
    const macroBtns: HTMLButtonElement[] = [];
    for (let i = 0; i < 8; i++) {
      const id = macroFromButton((i % 4) + 1, i >= 4);
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'mx-btn';
      b.style.justifyContent = 'center';
      b.innerHTML = `<span class="led" aria-hidden="true"></span><span>${esc(macroName(id))}</span>`;
      b.addEventListener('click', () => {
        macro = id;
        for (let j = 0; j < macroBtns.length; j++) macroBtns[j]!.setAttribute('aria-pressed', j === i ? 'true' : 'false');
        draw();
      });
      if (i === 0) b.setAttribute('aria-pressed', 'true');
      macroBtns.push(b);
      bank.appendChild(b);
    }

    const progCtl = range({
      min: 0,
      max: 1,
      step: 0.005,
      value: progress,
      label: 'Macro progress',
      onInput: (v) => {
        progress = v;
        auto = false;
        autoBtn.setAttribute('aria-pressed', 'false');
        draw();
      },
    });

    const autoBtn = toggle('Run', auto, (on) => {
      auto = on;
    });
    const jsBtn = button('Joystick: left', () => {
      joystickX = joystickX < 0 ? 1 : -1;
      jsBtn.textContent = `Joystick: ${joystickX < 0 ? 'left' : 'right'}`;
      draw();
    });
    const sqBtn = toggle('Square wipe active', false, (on) => {
      squareWipe = on;
      draw();
    });

    let tick = 0;

    const draw = (): void => {
      const frame = macroFrame(macro, progress, tick, { joystickX, squareWipe });
      ctx.clearRect(0, 0, w, h);

      const layerFill = (layer: string): string => {
        if (layer === 'A') return 'rgba(139,143,163,0.35)';
        if (layer === 'B') return token('--mx-amber');
        if (layer === 'matte') return token('--mx-green');
        if (layer === 'black') return '#000';
        return 'transparent';
      };

      // background layer
      ctx.fillStyle = layerFill(frame.bg);
      ctx.fillRect(0, 0, w, h);

      // mosaic overlay hint
      if (frame.mosaic > 0) {
        const cells = Math.max(2, Math.round(4 + frame.mosaic * 28));
        ctx.strokeStyle = 'rgba(255,255,255,0.07)';
        ctx.lineWidth = 1;
        for (let i = 1; i < cells; i++) {
          ctx.beginPath();
          ctx.moveTo((i / cells) * w, 0);
          ctx.lineTo((i / cells) * w, h);
          ctx.stroke();
          ctx.beginPath();
          ctx.moveTo(0, (i / cells) * h);
          ctx.lineTo(w, (i / cells) * h);
          ctx.stroke();
        }
      }

      // foreground inset
      if (frame.fg !== 'none') {
        const cx = frame.center[0] * w;
        const cy = frame.center[1] * h;
        const hx = frame.half[0] * w;
        const hy = frame.half[1] * h;
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(frame.angle);
        ctx.globalAlpha = 1 - frame.mix;
        ctx.fillStyle = layerFill(frame.fg);
        if (frame.shape === 1) {
          ctx.beginPath();
          ctx.ellipse(0, 0, hx, hy, 0, 0, Math.PI * 2);
          ctx.fill();
        } else {
          ctx.fillRect(-hx, -hy, hx * 2, hy * 2);
        }
        ctx.restore();
        ctx.globalAlpha = 1;
      }

      ctx.strokeStyle = token('--mx-line');
      ctx.lineWidth = 1;
      ctx.strokeRect(0.5, 0.5, w - 1, h - 1);

      const needsB = macroNeedsLeverAtB(macro);
      info.innerHTML =
        `<div class="mx-row" style="gap:10px;margin-bottom:12px">
           <div class="mx-readout">${esc(macroName(macro))}</div>
           <div class="mx-readout muted">character ${esc(macroCharacter(macro))}</div>
         </div>` +
        kv('Layers', `bg <code>${frame.bg}</code> · fg <code>${frame.fg}</code>`) +
        kv('Centre / half', `(${frame.center[0].toFixed(2)}, ${frame.center[1].toFixed(2)}) · (${frame.half[0].toFixed(2)}, ${frame.half[1].toFixed(2)})`) +
        kv('Angle / mix / mosaic', `${frame.angle.toFixed(2)} rad · ${frame.mix.toFixed(2)} · ${frame.mosaic.toFixed(2)}`) +
        kv(
          'Lever gate',
          needsB
            ? `requires the lever at B — <code>canRunMacro</code> at lever 1 = ${String(canRunMacro(macro, 1))}, at lever 0 = ${String(canRunMacro(macro, 0))}`
            : 'no lever precondition',
        ) +
        (macro === 'shutter'
          ? kv('Shutter reveal', `<code>${shutterRevealShape(squareWipe)}</code>`)
          : '') +
        (macro === 'vibrate' ? kv('Duration', `${VIBRATE_FRAMES} frames`) : '');
    };

    this.onDispose(
      runWhileVisible(this, () => {
        if (!auto) return;
        tick++;
        progress = (progress + 0.006) % 1;
        progCtl.value = String(progress);
        draw();
      }),
    );

    const controls = document.createElement('div');
    controls.className = 'mx-row';
    controls.style.marginTop = '12px';
    controls.appendChild(autoBtn);
    controls.appendChild(jsBtn);
    controls.appendChild(sqBtn);

    this.appendChild(bank);
    this.appendChild(controls);
    const pf = field('Progress', progCtl);
    pf.style.marginTop = '12px';
    this.appendChild(pf);
    const cw = document.createElement('div');
    cw.style.marginTop = '14px';
    cw.appendChild(canvas);
    this.appendChild(cw);
    this.appendChild(info);
    this.appendChild(
      caption(
        'Every rectangle, angle and mix value comes from <code>macroFrame</code> in ' +
          '<code>src/core/special-mode-geometry.ts</code> — the same pure geometry the GPU pass consumes. ' +
          'The colours here stand in for the A-bus, B-bus and Matte layers.',
      ),
    );
    draw();
  }
}

function kv(k: string, v: string): string {
  return `<div style="display:flex;gap:14px;padding:6px 0;border-bottom:1px solid var(--mx-line)">
    <span class="mx-label" style="min-width:11rem">${k}</span><span>${v}</span></div>`;
}

defineDemo('mx-demo-event-memory', EventMemory);
defineDemo('mx-demo-special-modes', SpecialModes);
