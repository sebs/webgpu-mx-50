// Live benches (docs/WEBSITE.md §5 Tier 1): the real renderer with one or two blocks
// exposed. A bench IS a small <mx-mixer> — ADR-0017 child composition, exactly what an
// embedder would write — so the site never builds a GPU harness of its own:
//
//   <mx-mixer feeds="pattern" run="visible" shared-device preset="…/presets/<look>.json">
//     <div class="mx-bench-side"><mx-dsk-block></mx-dsk-block></div>
//   </mx-mixer>
//
// `run="visible"` keeps the §5 budget rule (only what is on screen renders, everything
// stops when the tab is hidden) and `shared-device` gives the page one GPUDevice. Under
// the mixer sits a small toolbar: reset the look, copy a link that restores the current
// panel (site/look-link.ts), and show the embed HTML for exactly this bench.

import { defineMixer } from '../../src/ui/mixer.js';
import { defineBlocks } from '../../src/ui/blocks/index.js';
import type { MxMixer } from '../../src/ui/mixer.js';
import { factoryState } from '../factory.js';
import { siteRoot, el, esc } from '../shell.js';
import { lookUrl, lookFor } from '../look-link.js';
import { POSTERS } from '../posters.js';
import { capturedMedia } from './captured.js';

/** Define the host and every block element (idempotent). */
export function defineLive(): void {
  defineMixer();
  defineBlocks();
}

/** URL of a generated look preset (scripts/site-data.ts → site/generated/presets/). */
export function presetUrl(lookId: string): string {
  return new URL(`site/generated/presets/${lookId}.json`, siteRoot()).href;
}

/** Absolute URL of a compiled src/ module on this site, for copy-paste embed snippets. */
export function moduleUrl(path: string): string {
  return new URL(path, siteRoot()).href;
}

// Re-exported for the pages that already import it from here (recipes, learn, attract).
export { factoryState };

/** The import lines every embed snippet needs. */
export function importSnippet(): string {
  return (
    `<script type="module">\n` +
    `  import { defineMixer } from '${moduleUrl('src/ui/mixer.js')}';\n` +
    `  import { defineBlocks } from '${moduleUrl('src/ui/blocks/index.js')}';\n` +
    `  defineMixer();\n` +
    `  defineBlocks();\n` +
    `</script>`
  );
}

/** A code block with a copy button. */
export function codeBlock(code: string, label = 'HTML'): HTMLElement {
  const wrap = el('div', { class: 'mx-code' });
  const head = el('div', { class: 'mx-code-head' });
  head.appendChild(el('span', { class: 'mx-label', text: label }));
  const copy = el('button', { class: 'mx-btn', text: 'Copy', attrs: { type: 'button' } });
  copy.addEventListener('click', () => {
    void copyText(code).then((ok) => {
      copy.textContent = ok ? 'Copied' : 'Select and copy';
      setTimeout(() => (copy.textContent = 'Copy'), 1600);
    });
  });
  head.appendChild(copy);
  const pre = el('pre');
  pre.appendChild(el('code', { text: code }));
  wrap.append(head, pre);
  return wrap;
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export interface LiveBenchSpec {
  /** Element id; also the bench key in share links. */
  readonly id: string;
  /** A look id from site/looks.ts; omitted = the factory panel. */
  readonly look?: string;
  /** Connected block tags shown beside the monitor. */
  readonly blocks: readonly string[];
  readonly width?: number;
  readonly height?: number;
  /** Stack the blocks under the monitor instead of beside it (many blocks). */
  readonly stacked?: boolean;
  /** Give the blocks a wide column beside the monitor (Mix/Wipe). */
  readonly wide?: boolean;
  /** Hide the toolbar (reset / link / HTML). */
  readonly bare?: boolean;
}

export interface LiveBench {
  readonly root: HTMLElement;
  readonly mixer: MxMixer;
  /** Where the blocks live (inside the mixer, so they connect by ancestry). */
  readonly side: HTMLElement;
}

/** Build a bench. The mixer boots when it first scrolls into view. */
export function liveBench(spec: LiveBenchSpec): LiveBench {
  defineLive();
  const root = el('div', { class: 'mx-live', attrs: { id: spec.id } });
  const width = spec.width ?? 640;
  const height = spec.height ?? 360;

  const mixer = document.createElement('mx-mixer') as MxMixer;
  mixer.className = 'mx-bench' + (spec.stacked ? ' stacked' : '') + (spec.wide ? ' wide' : '');
  mixer.setAttribute('feeds', 'pattern');
  mixer.setAttribute('run', 'visible');
  mixer.setAttribute('shared-device', '');
  mixer.setAttribute('width', String(width));
  mixer.setAttribute('height', String(height));
  if (spec.look) mixer.setAttribute('preset', presetUrl(spec.look));

  // Placeholder until the canvas exists: the mixer inserts its canvas before it.
  const screen = el('div', { class: 'mx-bench-screen' });
  screen.style.aspectRatio = `${width} / ${height}`;
  screen.innerHTML = `<span class="mx-chip"><span class="led"></span>starts when on screen</span>`;
  mixer.appendChild(screen);

  const side = el('div', { class: 'mx-bench-side' });
  for (let i = 0; i < spec.blocks.length; i++) side.appendChild(document.createElement(spec.blocks[i]!));
  mixer.appendChild(side);
  root.appendChild(mixer);

  const bar = el('div', { class: 'mx-bench-bar' });
  const status = el('span', { class: 'mx-chip', html: `<span class="led"></span>waiting` });
  bar.appendChild(status);
  root.appendChild(bar);

  mixer.addEventListener('mx-unavailable', (e) => {
    e.preventDefault();
    root.classList.add('unavailable');
    const why =
      `<p class="mx-dim" style="margin:0;max-width:44ch">This bench is the real WebGPU renderer, and this browser ` +
      `cannot start it (${esc((e as CustomEvent<string>).detail.split('.')[0] ?? 'no WebGPU')}). The description ` +
      `and the no-GPU demos on this page still work.</p>`;
    if (POSTERS.indexOf(spec.id) !== -1) {
      // Captured from the real renderer (scripts/capture-posters.mjs) and labelled as such:
      // a recorded loop where there is one (never autoplayed under reduced motion), else the still.
      screen.classList.add('poster');
      screen.innerHTML = capturedMedia(spec.id, 'this bench');
      const note = el('div', { html: why, attrs: { style: 'margin-top:10px' } });
      root.insertBefore(note, bar);
    } else {
      screen.innerHTML = why;
    }
    side.hidden = true;
    status.className = 'mx-chip';
    status.innerHTML = `<span class="led"></span>needs WebGPU`;
  });

  mixer.addEventListener(
    'mx-ready',
    () => {
      screen.remove();
      root.classList.add('ready'); // the explicit "running" mark (a canvas alone exists mid-boot)
      // What scripts/capture-posters.mjs records: the Program Out canvas, as a still and a loop.
      const canvas = mixer.querySelector(':scope > canvas');
      if (canvas) {
        canvas.setAttribute('data-poster', '');
        canvas.setAttribute('data-loop', '');
      }
      status.className = 'mx-chip live';
      status.innerHTML = `<span class="led"></span>live · pauses off screen`;
      const shared = lookFor(location.href, spec.id);
      if (shared && !mixer.loadPreset(shared)) status.innerHTML = `<span class="led"></span>live · shared link rejected`;
    },
    { once: true },
  );

  if (!spec.bare) {
    let original: string | null = null;
    const reset = el('button', { class: 'mx-btn needs-gpu', text: 'Reset', attrs: { type: 'button', title: 'Back to this bench\'s starting look' } });
    reset.addEventListener('click', () => {
      if (!spec.look) {
        mixer.dispatch({ type: 'LOAD_STATE', state: factoryState() });
        return;
      }
      const apply = (json: string): void => void mixer.loadPreset(json);
      if (original) apply(original);
      else
        void fetch(presetUrl(spec.look))
          .then((r) => r.text())
          .then((json) => {
            original = json;
            apply(json);
          });
    });

    const link = el('button', { class: 'mx-btn needs-gpu', text: 'Copy link to this look', attrs: { type: 'button' } });
    link.addEventListener('click', () => {
      const json = mixer.exportPreset();
      if (!json) return;
      const url = lookUrl(location.href, spec.id, json);
      void copyText(url).then((ok) => {
        link.textContent = ok ? 'Link copied' : 'Copy failed — link in address bar';
        if (!ok) history.replaceState(null, '', url);
        setTimeout(() => (link.textContent = 'Copy link to this look'), 1800);
      });
    });

    const htmlBtn = el('button', { class: 'mx-btn', text: 'Show HTML', attrs: { type: 'button', 'aria-expanded': 'false' } });
    const snippet = codeBlock(benchSnippet(spec));
    snippet.hidden = true;
    htmlBtn.addEventListener('click', () => {
      snippet.hidden = !snippet.hidden;
      htmlBtn.setAttribute('aria-expanded', snippet.hidden ? 'false' : 'true');
      htmlBtn.textContent = snippet.hidden ? 'Show HTML' : 'Hide HTML';
    });

    bar.append(reset, link, htmlBtn);
    root.appendChild(snippet);
  }

  return { root, mixer, side };
}

/** The copy-paste HTML that reproduces a bench on any page. */
export function benchSnippet(spec: LiveBenchSpec): string {
  const attrs = [`feeds="pattern"`];
  if (spec.look) attrs.push(`preset="${presetUrl(spec.look)}"`);
  const blocks = spec.blocks.map((tag) => `  <${tag}></${tag}>`).join('\n');
  return `<mx-mixer ${attrs.join(' ')}>\n${blocks}\n</mx-mixer>\n\n${importSnippet()}`;
}
