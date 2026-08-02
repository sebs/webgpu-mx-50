// D18 — the signal spine.
//
// The processing stages and their order are read from src/core/signal-graph.ts at runtime,
// so the picture cannot drift from the pipeline. The Source and Program Out endpoints are
// authored diagram furniture: STAGE_ORDER holds only the five processing stages, and
// docs/WEBSITE.md §2 is explicit that the endpoints are drawn, not generated.

import {
  PER_BUS_STAGES,
  COMBINE_STAGE,
  DOWNSTREAM_STAGES,
  STAGE_ORDER,
  stageIsBefore,
} from '../../src/core/signal-graph.js';
import type { StageName } from '../../src/core/signal-graph.js';
import { DemoElement, defineDemo, caption } from './base.js';
import { href, esc, has } from '../shell.js';

const LABELS: Record<string, string> = {
  'colour-correction': 'Colour Correction',
  'digital-effect': 'Digital Effect',
  'mix-wipe': 'Mix / Wipe',
  'downstream-key': 'Downstream Key',
  fade: 'Fade',
};

const ANCHORS: Record<string, string> = {
  'colour-correction': 'colour-correction',
  'digital-effect': 'digital-effect',
  'mix-wipe': 'mix-wipe',
  'downstream-key': 'downstream-key',
  fade: 'fade',
};

class SignalSpine extends DemoElement {
  protected render(): void {
    const generated: string[] = [];
    for (let i = 0; i < STAGE_ORDER.length; i++) generated.push(STAGE_ORDER[i]!);

    const wrap = document.createElement('div');
    wrap.className = 'mx-spine';

    const style = document.createElement('style');
    style.textContent = `
      .mx-spine { --gap: 10px; }
      .mx-spine ol { list-style: none; margin: 0; padding: 0; display: flex; flex-wrap: wrap; gap: var(--gap); align-items: stretch; }
      .mx-spine li { display: flex; align-items: center; gap: var(--gap); }
      .mx-spine a, .mx-spine .node {
        display: block; text-decoration: none; color: var(--mx-text);
        border: 1px solid var(--mx-line); border-radius: 7px; padding: 10px 13px;
        background: linear-gradient(180deg, var(--mx-panel-hi), var(--mx-panel-lo));
        min-width: 8.5rem;
      }
      .mx-spine a:hover { border-color: color-mix(in srgb, var(--mx-amber) 55%, var(--mx-line)); }
      .mx-spine a:focus-visible { outline: 2px solid var(--mx-accent); outline-offset: 2px; }
      .mx-spine .node.endpoint { background: var(--mx-well); border-style: dashed; }
      .mx-spine .k { display: block; font-size: 9px; text-transform: uppercase; letter-spacing: 0.14em; color: var(--mx-label-dim); margin-bottom: 4px; }
      .mx-spine .n { display: block; font-size: 14px; }
      .mx-spine .arrow { color: var(--mx-label-dim); font-size: 13px; }
      .mx-spine .bus { font-size: 9px; letter-spacing: 0.14em; text-transform: uppercase; color: var(--mx-amber); }
    `;
    wrap.appendChild(style);

    const ol = document.createElement('ol');

    const node = (kind: string, name: string, link: string | null, endpoint: boolean): HTMLElement => {
      const li = document.createElement('li');
      const inner = link
        ? `<a href="${link}"><span class="k">${esc(kind)}</span><span class="n">${esc(name)}</span></a>`
        : `<span class="node${endpoint ? ' endpoint' : ''}"><span class="k">${esc(kind)}</span><span class="n">${esc(name)}</span></span>`;
      li.innerHTML = inner + `<span class="arrow" aria-hidden="true">&rarr;</span>`;
      return li;
    };

    ol.appendChild(node('endpoint · drawn', 'Source & Matte', href('machine/') + '#sources', true));

    for (let i = 0; i < generated.length; i++) {
      const s = generated[i]! as StageName;
      const perBus = has(PER_BUS_STAGES as readonly string[], s);
      const kind = perBus ? 'per bus · generated' : s === COMBINE_STAGE ? 'combine · generated' : 'downstream · generated';
      ol.appendChild(node(kind, LABELS[s] ?? s, href('machine/') + '#' + (ANCHORS[s] ?? ''), false));
    }

    const last = ol.lastElementChild as HTMLElement | null;
    if (last) {
      const arrow = last.querySelector('.arrow');
      if (arrow) arrow.remove();
    }
    const outLi = node('endpoint · drawn', 'Program Out', href('machine/') + '#program-out', true);
    const outArrow = outLi.querySelector('.arrow');
    if (outArrow) outArrow.remove();
    ol.appendChild(outLi);

    wrap.appendChild(ol);
    this.appendChild(wrap);

    const perBusList: string[] = [];
    for (let i = 0; i < PER_BUS_STAGES.length; i++) perBusList.push(PER_BUS_STAGES[i]!);
    const downList: string[] = [];
    for (let i = 0; i < DOWNSTREAM_STAGES.length; i++) downList.push(DOWNSTREAM_STAGES[i]!);

    this.appendChild(
      caption(
        `The ${generated.length} middle stages and their order come from <code>STAGE_ORDER</code> in ` +
          `<code>src/core/signal-graph.ts</code> — per-bus <code>${perBusList.join('</code>, <code>')}</code>, ` +
          `combine <code>${COMBINE_STAGE}</code>, downstream <code>${downList.join('</code>, <code>')}</code>. ` +
          `The dashed endpoints are drawn, not generated. Sanity check from the same module: ` +
          `<code>stageIsBefore('digital-effect', 'fade')</code> = <strong>` +
          `${String(stageIsBefore('digital-effect', 'fade'))}</strong>.`,
      ),
    );
  }
}

defineDemo('mx-demo-spine', SignalSpine);
