// D10 — the determinism bench (ADR-0012).
//
// Two independent LogicalClocks are fed the same wall-clock elapsed time, one in 60 Hz
// slices and one in 144 Hz slices, each driving its own transition runner. The point is
// the drift readout: a fixed-timestep accumulator means the same logical frame count and
// the same lever position at every wall-clock instant, whatever the display does.
//
// Nothing is simulated for effect — this is src/engine/clock.ts and src/core/timeline.ts
// stepped exactly the way the render loop steps them.

import { LogicalClock } from '../../src/engine/clock.js';
import { TICK_MS } from '../../src/constants.js';
import {
  startRunner,
  advanceRunner,
  runnerLever,
  runnerActive,
  runnerComplete,
  quantizeTransitionFrames,
  TRANSITION_MAX_FRAMES,
  TRANSITION_FRAME_STEP,
} from '../../src/core/timeline.js';
import type { TransitionRunner } from '../../src/state/state.js';
import { IDLE_RUNNER } from '../../src/state/state.js';
import { DemoElement, defineDemo, range, field, button, caption, runWhileVisible, readout, pad, token } from './base.js';

interface Rig {
  readonly hz: number;
  readonly clock: LogicalClock;
  runner: TransitionRunner;
  carryMs: number;
}

function makeRig(hz: number): Rig {
  return { hz, clock: new LogicalClock(), runner: IDLE_RUNNER, carryMs: 0 };
}

class DeterminismBench extends DemoElement {
  protected render(): void {
    let frames = 300;
    const rigs: Rig[] = [makeRig(60), makeRig(144)];

    const framesCtl = range({
      min: 0,
      max: TRANSITION_MAX_FRAMES,
      step: TRANSITION_FRAME_STEP,
      value: frames,
      label: 'Transition time in frames',
      onInput: (v) => {
        frames = quantizeTransitionFrames(v);
        framesOut.textContent = `${pad(frames, 3)} frames · ${(frames / 60).toFixed(2)} s`;
      },
    });
    const framesOut = readout(`${pad(frames, 3)} frames · ${(frames / 60).toFixed(2)} s`);

    const cards = document.createElement('div');
    cards.className = 'mx-grid cols-2';

    const views = rigs.map((rig) => {
      const card = document.createElement('div');
      card.className = 'mx-panel mx-card';
      card.innerHTML =
        `<span class="mx-label">Present loop @ ${rig.hz} Hz</span>` +
        `<div class="mx-readout big" data-tick style="margin:10px 0">0</div>` +
        `<div style="height:10px;border-radius:5px;background:var(--mx-well);border:1px solid var(--mx-line);overflow:hidden">` +
        `<div data-bar style="height:100%;width:0%;background:var(--mx-amber)"></div></div>` +
        `<p class="mx-dim" style="margin:10px 0 0;font-size:13px">lever <span data-lever>0.000</span> · ` +
        `<span data-phase>idle</span></p>`;
      cards.appendChild(card);
      return {
        tick: card.querySelector('[data-tick]') as HTMLElement,
        bar: card.querySelector('[data-bar]') as HTMLElement,
        lever: card.querySelector('[data-lever]') as HTMLElement,
        phase: card.querySelector('[data-phase]') as HTMLElement,
      };
    });

    const drift = document.createElement('div');
    drift.style.marginTop = '14px';

    const start = (): void => {
      for (let i = 0; i < rigs.length; i++) {
        const rig = rigs[i]!;
        rig.clock.reset();
        rig.carryMs = 0;
        rig.runner = startRunner(0, 1, frames, rig.clock.tick);
      }
    };

    const startBtn = button('Run Auto Take on both', start);
    const resetBtn = button('Reset', () => {
      for (let i = 0; i < rigs.length; i++) {
        rigs[i]!.clock.reset();
        rigs[i]!.runner = IDLE_RUNNER;
        rigs[i]!.carryMs = 0;
      }
      paint();
    });

    const paint = (): void => {
      for (let i = 0; i < rigs.length; i++) {
        const rig = rigs[i]!;
        const v = views[i]!;
        const lever = runnerLever(rig.runner);
        v.tick.textContent = pad(rig.clock.tick, 4);
        v.bar.style.width = `${(rig.runner.progress * 100).toFixed(2)}%`;
        v.lever.textContent = lever.toFixed(3);
        v.phase.textContent = rig.runner.phase;
      }
      const a = rigs[0]!;
      const b = rigs[1]!;
      const tickDrift = Math.abs(a.clock.tick - b.clock.tick);
      const leverDrift = Math.abs(runnerLever(a.runner) - runnerLever(b.runner));
      const settled = runnerComplete(a.runner) && runnerComplete(b.runner);
      drift.innerHTML =
        `<div class="mx-row" style="gap:10px">
           <div class="mx-readout" style="color:${tickDrift === 0 ? 'var(--mx-green)' : 'var(--mx-red)'}">
             frame drift ${tickDrift}</div>
           <div class="mx-readout" style="color:${leverDrift < 1e-9 ? 'var(--mx-green)' : 'var(--mx-red)'}">
             lever drift ${leverDrift.toExponential(1)}</div>
           ${settled ? '<span class="mx-chip ok"><span class="led"></span>both settled</span>' : ''}
         </div>`;
    };

    // Feed each rig the SAME elapsed wall time, chopped into its own refresh slices.
    let lastMs = 0;
    const dispose = runWhileVisible(this, (elapsed) => {
      const dt = Math.min(elapsed - lastMs, 100);
      lastMs = elapsed;
      if (dt <= 0) return;
      for (let i = 0; i < rigs.length; i++) {
        const rig = rigs[i]!;
        const slice = 1000 / rig.hz;
        rig.carryMs += dt;
        while (rig.carryMs >= slice) {
          rig.carryMs -= slice;
          // Exactly what engine/loop.ts does each present frame: accumulate, then advance
          // the runner to whatever absolute tick the clock now reports.
          rig.clock.accumulate(slice);
          if (runnerActive(rig.runner)) rig.runner = advanceRunner(rig.runner, rig.clock.tick);
        }
      }
      paint();
    });
    this.onDispose(dispose);

    const controls = document.createElement('div');
    controls.className = 'mx-row';
    controls.style.marginBottom = '14px';
    controls.appendChild(startBtn);
    controls.appendChild(resetBtn);
    controls.appendChild(framesOut);

    this.appendChild(field('Transition time (quantised to 2-frame steps, 0–510)', framesCtl));
    const spacer = document.createElement('div');
    spacer.style.height = '14px';
    this.appendChild(spacer);
    this.appendChild(controls);
    this.appendChild(cards);
    this.appendChild(drift);
    this.appendChild(
      caption(
        `Two <code>LogicalClock</code> instances (${TICK_MS.toFixed(2)} ms per logical tick) fed identical elapsed ` +
          `time in 60 Hz and 144 Hz slices, each driving <code>advanceRunner</code>. The frame counters and lever ` +
          `positions stay locked because logical time is an accumulator, not a per-frame increment — that is ADR-0012 ` +
          `in one screen. Try dragging the transition time mid-run.`,
      ),
    );
    void token;
    paint();
  }
}

defineDemo('mx-demo-determinism', DeterminismBench);
