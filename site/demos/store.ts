// D11 — the store inspector (ADR-0011).
//
// A handful of real controls dispatching real commands into a real PanelStore, with the
// resulting JSON diff highlighted. The claim being demonstrated is that the entire panel
// is one serialisable value and every change is one typed command through one reducer —
// which is why Event Memory, persistence and the input layer are all thin.

import { PanelStore } from '../../src/state/store.js';
import { FACTORY_PRESET } from '../../src/state/state.js';
import type { PanelState } from '../../src/state/state.js';
import type { Command } from '../../src/state/commands.js';
import { DemoElement, defineDemo, button, caption, range, field } from './base.js';
import { esc } from '../shell.js';

/** Dotted paths whose values differ between two snapshots. */
function diffPaths(a: unknown, b: unknown, prefix: string, out: string[]): void {
  if (a === b) return;
  const aObj = typeof a === 'object' && a !== null;
  const bObj = typeof b === 'object' && b !== null;
  if (!aObj || !bObj || Array.isArray(a) !== Array.isArray(b)) {
    out.push(prefix);
    return;
  }
  const keys: string[] = [];
  const ka = Object.keys(a as object);
  const kb = Object.keys(b as object);
  for (let i = 0; i < ka.length; i++) keys.push(ka[i]!);
  for (let i = 0; i < kb.length; i++) if (keys.indexOf(kb[i]!) === -1) keys.push(kb[i]!);
  for (let i = 0; i < keys.length; i++) {
    const k = keys[i]!;
    diffPaths(
      (a as Record<string, unknown>)[k],
      (b as Record<string, unknown>)[k],
      prefix ? prefix + '.' + k : k,
      out,
    );
  }
}

function valueAt(state: unknown, path: string): unknown {
  const parts = path.split('.');
  let cur: unknown = state;
  for (let i = 0; i < parts.length; i++) {
    if (typeof cur !== 'object' || cur === null) return undefined;
    cur = (cur as Record<string, unknown>)[parts[i]!];
  }
  return cur;
}

class StoreInspector extends DemoElement {
  protected render(): void {
    const store = new PanelStore(FACTORY_PRESET);
    let lastCommand: Command | null = null;
    let lastPaths: string[] = [];
    let prevState: PanelState = store.getSnapshot();

    const send = (c: Command): void => {
      prevState = store.getSnapshot();
      lastCommand = c;
      store.dispatch(c);
      if (store.getSnapshot() === prevState) {
        // A no-op command produced no new snapshot — worth showing, it is the reducer's
        // documented short-circuit.
        lastPaths = [];
        paint();
      }
    };

    const controls = document.createElement('div');
    controls.className = 'mx-row';
    controls.style.marginBottom = '12px';
    controls.appendChild(button('Assign SRC 3 → bus A', () => send({ type: 'ASSIGN_SOURCE', bus: 'A', source: 3 })));
    controls.appendChild(button('Assign MATTE → bus B', () => send({ type: 'ASSIGN_SOURCE', bus: 'B', source: 'matte' })));
    controls.appendChild(button('Transition → NAM', () => send({ type: 'SET_TRANSITION_TYPE', transition: 'nam' })));
    controls.appendChild(button('Wipe family → square', () => send({ type: 'PRESS_WIPE_FAMILY', family: 'square' })));
    controls.appendChild(button('BORDER press', () => send({ type: 'PRESS_BORDER' })));
    controls.appendChild(button('DSK on', () => send({ type: 'SET_DSK_ON', on: true })));
    controls.appendChild(button('Matte colour ▲', () => send({ type: 'STEP_MATTE_COLOR', direction: 'up' })));
    controls.appendChild(
      button('Reset to factory preset', () => send({ type: 'LOAD_STATE', state: FACTORY_PRESET })),
    );

    const leverCtl = range({
      min: 0,
      max: 1,
      step: 0.01,
      value: 0,
      label: 'Mix/Wipe lever',
      onInput: (v) => send({ type: 'SET_LEVER', position: v }),
    });

    const cmdBox = document.createElement('div');
    cmdBox.style.marginBottom = '12px';

    const diffBox = document.createElement('div');
    diffBox.className = 'mx-tablewrap';

    const jsonBox = document.createElement('pre');
    jsonBox.className = 'mono';
    jsonBox.style.cssText =
      'margin:12px 0 0;max-height:260px;overflow:auto;background:var(--mx-well);border:1px solid var(--mx-line);' +
      'border-radius:6px;padding:12px;font-size:12px;line-height:1.5;color:var(--mx-label)';

    const sizeNote = document.createElement('p');
    sizeNote.className = 'mx-dim';
    sizeNote.style.cssText = 'margin:10px 0 0;font-size:13px';

    const copyBtn = button('Copy state JSON', () => {
      void navigator.clipboard?.writeText(JSON.stringify(store.getSnapshot(), null, 2));
      copyBtn.textContent = 'Copied';
      window.setTimeout(() => (copyBtn.textContent = 'Copy state JSON'), 1200);
    });

    const paint = (): void => {
      const next = store.getSnapshot();

      cmdBox.innerHTML = lastCommand
        ? `<span class="mx-label">Last command</span>
           <div class="mx-readout" style="margin-top:6px">${esc(JSON.stringify(lastCommand))}</div>`
        : `<span class="mx-label">Last command</span>
           <p class="mx-dim" style="margin:6px 0 0">Press a control — every change below arrives as one typed command.</p>`;

      if (lastPaths.length === 0) {
        diffBox.innerHTML =
          `<table class="mx-table"><tbody><tr><td class="mx-dim">` +
          (lastCommand
            ? 'No change — the reducer returned the same snapshot, so no subscriber fired.'
            : 'No command dispatched yet.') +
          `</td></tr></tbody></table>`;
      } else {
        const rows: string[] = [];
        for (let i = 0; i < lastPaths.length; i++) {
          const p = lastPaths[i]!;
          rows.push(
            `<tr><td><code>${esc(p)}</code></td>` +
              `<td class="mx-dim">${esc(JSON.stringify(valueAt(prevState, p)))}</td>` +
              `<td style="color:var(--mx-amber)">${esc(JSON.stringify(valueAt(next, p)))}</td></tr>`,
          );
        }
        diffBox.innerHTML =
          `<table class="mx-table"><thead><tr><th>Path</th><th>Before</th><th>After</th></tr></thead>` +
          `<tbody>${rows.join('')}</tbody></table>`;
      }

      const json = JSON.stringify(next, null, 2);
      jsonBox.textContent = json;
      sizeNote.innerHTML =
        `The whole panel — both buses, every effect, the wipe, DSK, fade, audio, memory and special modes — ` +
        `is <strong>${(json.length / 1024).toFixed(1)} kB</strong> of JSON with no handles and no cycles. ` +
        `That is what makes Event Memory a copy and persistence a <code>JSON.stringify</code>.`;
    };

    this.onDispose(
      store.subscribe((next, prev) => {
        prevState = prev;
        const paths: string[] = [];
        diffPaths(prev, next, '', paths);
        lastPaths = paths;
        paint();
      }),
    );

    this.appendChild(controls);
    this.appendChild(field('Mix/Wipe lever → SET_LEVER', leverCtl));
    const gap = document.createElement('div');
    gap.style.height = '14px';
    this.appendChild(gap);
    this.appendChild(cmdBox);
    this.appendChild(diffBox);
    this.appendChild(jsonBox);
    this.appendChild(sizeNote);
    const cw = document.createElement('div');
    cw.style.marginTop = '10px';
    cw.appendChild(copyBtn);
    this.appendChild(cw);
    this.appendChild(
      caption(
        'A real <code>PanelStore</code> with the real <code>reduce</code>. The diff is computed by walking the ' +
          'two snapshots — no instrumentation in the store itself, because immutable snapshots make that unnecessary.',
      ),
    );
    paint();
  }
}

defineDemo('mx-demo-store', StoreInspector);
