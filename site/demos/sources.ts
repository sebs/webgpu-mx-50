// D19 — the bus board: assign Source 1–4 or the internal Matte to each bus, and watch
// the substitute-source rule decide what actually reaches the stages where Matte is
// illegal. The blink is the hardware's way of telling you which real source stands in.

import { PanelStore } from '../../src/state/store.js';
import { FACTORY_PRESET } from '../../src/state/state.js';
import { resolveBusSource, usesMatte, busAudioSource } from '../../src/core/resolve.js';
import type { ResolveContext } from '../../src/core/resolve.js';
import { SOURCE_SLOTS, BUS_IDS } from '../../src/core/types.js';
import type { BusId, BusSource } from '../../src/core/types.js';
import { DemoElement, defineDemo, caption } from './base.js';

const CONTEXTS: readonly ResolveContext[] = ['mixWipe', 'key', 'dsk', 'fade', 'directOut'];
const CONTEXT_LABEL: Record<string, string> = {
  mixWipe: 'Mix / Wipe',
  key: 'Lum / Chroma key',
  dsk: 'Downstream Key',
  fade: 'Fade',
  directOut: 'Direct program out',
};

class BusBoard extends DemoElement {
  protected render(): void {
    const store = new PanelStore(FACTORY_PRESET);

    const style = document.createElement('style');
    style.textContent = `
      @keyframes mx-blink { 0%,100% { opacity: 1 } 50% { opacity: 0.15 } }
      .mx-blink .led { animation: mx-blink 1s step-end infinite; }
      @media (prefers-reduced-motion: reduce) { .mx-blink .led { animation: none; } }
    `;
    this.appendChild(style);

    const board = document.createElement('div');
    board.style.display = 'grid';
    board.style.gap = '10px';

    const buttons: Record<string, HTMLButtonElement[]> = { A: [], B: [] };

    for (let b = 0; b < BUS_IDS.length; b++) {
      const bus = BUS_IDS[b]!;
      const rowEl = document.createElement('div');
      rowEl.className = 'mx-row';
      const label = document.createElement('span');
      label.className = 'mx-label';
      label.style.minWidth = '4rem';
      label.textContent = `Bus ${bus}`;
      rowEl.appendChild(label);

      const options: BusSource[] = [];
      for (let i = 0; i < SOURCE_SLOTS.length; i++) options.push(SOURCE_SLOTS[i]!);
      options.push('matte');

      for (let i = 0; i < options.length; i++) {
        const src = options[i]!;
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'mx-btn';
        btn.innerHTML = `<span class="led" aria-hidden="true"></span><span>${src === 'matte' ? 'MATTE' : 'SRC ' + src}</span>`;
        btn.addEventListener('click', () => store.dispatch({ type: 'ASSIGN_SOURCE', bus, source: src }));
        buttons[bus]!.push(btn);
        rowEl.appendChild(btn);
      }
      board.appendChild(rowEl);
    }

    const table = document.createElement('div');
    table.className = 'mx-tablewrap';
    table.style.marginTop = '14px';

    const sync = (): void => {
      const s = store.getSnapshot();
      for (let b = 0; b < BUS_IDS.length; b++) {
        const bus = BUS_IDS[b]!;
        const busState = bus === 'A' ? s.busA : s.busB;
        const opts = buttons[bus]!;
        for (let i = 0; i < opts.length; i++) {
          const isMatte = i === opts.length - 1;
          const value: BusSource = isMatte ? 'matte' : SOURCE_SLOTS[i]!;
          const selected = busState.source === value;
          const isSubstitute = busState.source === 'matte' && !isMatte && busState.substituteSource === value;
          opts[i]!.setAttribute('aria-pressed', selected ? 'true' : 'false');
          opts[i]!.classList.toggle('mx-blink', isSubstitute);
          if (isSubstitute) opts[i]!.querySelector('.led')!.setAttribute('style', 'background:var(--mx-amber);box-shadow:0 0 8px var(--mx-amber)');
          else opts[i]!.querySelector('.led')!.removeAttribute('style');
        }
      }

      const rows: string[] = [];
      for (let c = 0; c < CONTEXTS.length; c++) {
        const ctx = CONTEXTS[c]!;
        const cells: string[] = [`<td>${CONTEXT_LABEL[ctx]}</td>`];
        for (let b = 0; b < BUS_IDS.length; b++) {
          const bus: BusId = BUS_IDS[b]!;
          const busState = bus === 'A' ? s.busA : s.busB;
          const resolved = resolveBusSource(busState, ctx);
          const matte = usesMatte(busState, ctx);
          const substituted = busState.source === 'matte' && !matte;
          cells.push(
            `<td>${matte ? '<strong>MATTE</strong>' : 'Source ' + resolved}` +
              (substituted ? ` <span class="mx-dim">(substituted — Matte is illegal here)</span>` : '') +
              `</td>`,
          );
        }
        rows.push(`<tr>${cells.join('')}</tr>`);
      }

      const audioA = busAudioSource(s.busA);
      const audioB = busAudioSource(s.busB);
      rows.push(
        `<tr><td>Bus audio follows video</td><td>${audioA === null ? '<span class="mx-dim">silent (Matte)</span>' : 'Source ' + audioA}</td>` +
          `<td>${audioB === null ? '<span class="mx-dim">silent (Matte)</span>' : 'Source ' + audioB}</td></tr>`,
      );

      table.innerHTML =
        `<table class="mx-table"><thead><tr><th>Consumer</th><th>Bus A resolves to</th><th>Bus B resolves to</th></tr></thead>` +
        `<tbody>${rows.join('')}</tbody></table>`;
    };

    this.onDispose(store.subscribe(sync));

    this.appendChild(board);
    this.appendChild(table);
    this.appendChild(
      caption(
        'Assignment goes through the real reducer (<code>ASSIGN_SOURCE</code>); the resolution table calls ' +
          '<code>resolveBusSource</code> / <code>usesMatte</code> / <code>busAudioSource</code> from ' +
          '<code>src/core/resolve.ts</code> — the single authority every stage consumes, so they cannot disagree. ' +
          'Select MATTE on a bus to see the substitute source start blinking.',
      ),
    );
    sync();
  }
}

defineDemo('mx-demo-bus-board', BusBoard);
