// Route: /embed/
//
// Developer docs for the composable embedding API (ADR-0017). Every example is the code
// shown under it, executed: the HTML is inserted as-is and the script runs as a module
// from the very string on the page — so the snippet cannot drift from what runs. The
// reference tables are rendered from the tables that sit next to the code
// (src/ui/mixer-api.ts, src/ui/blocks/reference.ts), which unit tests keep honest.

import { mountShell, section, body, el, href, esc, srcLink, REPO } from '../shell.js';
import { defineLive, presetUrl, moduleUrl, codeBlock } from '../demos/live.js';
import { MIXER_ATTRIBUTES, MIXER_EVENTS, MIXER_MEMBERS, MIXER_CONTEXT_MEMBERS } from '../../src/ui/mixer-api.js';
import { BLOCK_TAGS, BLOCK_REFERENCE } from '../../src/ui/blocks/index.js';
import '../demos/primitives.js';

defineLive();
const main = mountShell({ route: 'embed/' });

const MIXER_JS = moduleUrl('src/ui/mixer.js');
const BLOCKS_JS = moduleUrl('src/ui/blocks/index.js');

// ---------------------------------------------------------------- intro

const intro = el('section');
intro.style.padding = '64px 0 8px';
const introWrap = el('div', { class: 'mx-wrap' });
introWrap.innerHTML = `
  <span class="mx-label">Embed it · ADR-0017</span>
  <h1 style="margin:14px 0 18px;max-width:24ch">The mixer is a set of HTML elements.</h1>
  <p class="mx-prose" style="font-size:17px;color:var(--mx-label);max-width:64ch">
    <code>&lt;mx-mixer&gt;</code> owns the engine, the GPU and the render loop. Every hardware block is its own
    element that finds its mixer by itself. You can use them in four ways, from one tag to script only. Each
    example below runs the code shown under it, as written.
  </p>
  <p class="mx-prose mx-dim" style="max-width:64ch">
    There is no npm package and nothing to build. Every module on this site is plain ESM, so you can import
    straight from it, or copy <a href="${REPO}/tree/main/src">src/</a> into your project. Without WebGPU a mixer
    shows a short message in place of its picture. The <a href="#primitives">controls gallery</a> works without it.
  </p>`;
intro.appendChild(introWrap);
main.appendChild(intro);

const load = section({ label: 'Step zero', title: 'Load the elements' });
body(load).appendChild(
  codeBlock(
    `<script type="module">\n` +
      `  import { defineMixer } from '${MIXER_JS}';\n` +
      `  import { defineBlocks } from '${BLOCKS_JS}';\n` +
      `  defineMixer();   // <mx-mixer>\n` +
      `  defineBlocks();  // <mx-source-block>, <mx-dsk-block>, … (all eleven)\n` +
      `</script>`,
  ),
);
body(load).appendChild(
  el('p', {
    class: 'mx-prose mx-dim',
    html:
      `Both calls are idempotent and upgrade markup already in the page. ` +
      `The live copies below also set <code>run="visible"</code> and <code>shared-device</code>: this page has many ` +
      `mixers, and those two attributes keep it to one GPU device and only the mixers on screen rendering. ` +
      `Every attribute is in the <a href="#reference">reference</a>.`,
    attrs: { style: 'margin-top:14px' },
  }),
);
main.appendChild(load);

// ---------------------------------------------------------------- examples

/** Insert `html`, then run `js` as a module — exactly the strings shown in the snippet. */
function runExample(stage: HTMLElement, html: string, js: string): void {
  stage.innerHTML = html;
  const url = URL.createObjectURL(new Blob([js], { type: 'text/javascript' }));
  const revoke = (): void => URL.revokeObjectURL(url);
  void import(url).then(revoke, revoke); // Promise.finally is above banira's compile lib floor
}

function example(opts: { id: string; label: string; title: string; prose: string; html: string; js: string }): HTMLElement {
  const s = section({ label: opts.label, title: opts.title, id: opts.id });
  const b = body(s);
  b.appendChild(el('div', { class: 'mx-prose', html: opts.prose, attrs: { style: 'margin-bottom:18px' } }));
  const grid = el('div', { class: 'mx-example' });
  const stage = el('div', { class: 'mx-example-stage' });
  grid.appendChild(stage);
  grid.appendChild(codeBlock(`${opts.html}\n\n<script type="module">\n${indent(opts.js)}\n</script>`));
  b.appendChild(grid);
  runExample(stage, opts.html, opts.js);
  return s;
}

function indent(js: string): string {
  return js
    .split('\n')
    .map((l) => (l ? '  ' + l : l))
    .join('\n');
}

const DEFINE_MIXER = `import { defineMixer } from '${MIXER_JS}';\ndefineMixer();`;
const DEFINE_BOTH =
  `import { defineMixer } from '${MIXER_JS}';\n` +
  `import { defineBlocks } from '${BLOCKS_JS}';\n` +
  `defineMixer();\ndefineBlocks();`;

main.appendChild(
  example({
    id: 'one-tag',
    label: 'Shape 1',
    title: 'One tag',
    prose:
      `<p>A mixer with no children is a picture. <code>feeds="pattern"</code> binds four procedural test clips to ` +
      `Sources 1–4 (no assets, no network). <code>preset</code> loads a preset file through the same sanitising ` +
      `path as a file import. For your own clip, <code>src="clip.mp4"</code> puts it on Source 1, bus A.</p>`,
    html: `<mx-mixer feeds="pattern" run="visible" shared-device\n  preset="${presetUrl('wipe-border')}"></mx-mixer>`,
    js: DEFINE_MIXER,
  }),
);

main.appendChild(
  example({
    id: 'children',
    label: 'Shape 2',
    title: 'Blocks inside the mixer',
    prose:
      `<p>Put any block inside a mixer and it connects with no attributes and no script. It sends a context ` +
      `request that bubbles up to the nearest <code>&lt;mx-mixer&gt;</code>. Wrappers in between are fine, and ` +
      `several mixers on one page each keep their own blocks.</p>`,
    html:
      `<mx-mixer feeds="pattern" run="visible" shared-device\n  preset="${presetUrl('mix-half')}">\n` +
      `  <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:10px">\n` +
      `    <mx-source-block></mx-source-block>\n` +
      `    <mx-colour-correction-block></mx-colour-correction-block>\n` +
      `  </div>\n` +
      `</mx-mixer>`,
    js: DEFINE_BOTH,
  }),
);

main.appendChild(
  example({
    id: 'elsewhere',
    label: 'Shape 3',
    title: 'Controls anywhere on the page',
    prose:
      `<p>A block that is not inside its mixer names it with <code>for="id"</code>, like <code>&lt;label for&gt;</code>. ` +
      `The aside below is a sibling of the mixer, not a child, and it could just as well be in a sidebar or a ` +
      `dialog.</p>`,
    html:
      `<div style="display:grid;grid-template-columns:minmax(0,1.3fr) minmax(0,1fr);gap:12px;align-items:start">\n` +
      `  <mx-mixer id="remote-mixer" feeds="pattern" run="visible" shared-device\n    preset="${presetUrl('fade-video-only')}"></mx-mixer>\n` +
      `  <aside style="display:grid;gap:10px">\n` +
      `    <mx-fade-block for="remote-mixer"></mx-fade-block>\n` +
      `    <mx-dsk-block for="remote-mixer"></mx-dsk-block>\n` +
      `  </aside>\n` +
      `</div>`,
    js: DEFINE_BOTH,
  }),
);

main.appendChild(
  example({
    id: 'script',
    label: 'Shape 4',
    title: 'Script only',
    prose:
      `<p>No blocks at all: drive the panel with typed commands through <code>dispatch()</code>, read it back after ` +
      `every frame with <code>onFrame()</code>, and save or restore it as a preset file. MIDI, keyboard and ` +
      `serial input in the console work the same way: they all end in store commands.</p>`,
    html:
      `<mx-mixer id="scripted" feeds="pattern" run="visible" shared-device></mx-mixer>\n` +
      `<p id="scripted-controls">\n` +
      `  <button data-cmd="mix">Mix</button>\n` +
      `  <button data-cmd="wipe">Wipe 009</button>\n` +
      `  <button data-cmd="take">Auto Take</button>\n` +
      `  <button data-cmd="mosaic">Mosaic on B</button>\n` +
      `  <button data-cmd="export">Export preset</button>\n` +
      `</p>\n` +
      `<output id="scripted-frame">waiting for the mixer…</output>\n` +
      `<pre id="scripted-json"></pre>`,
    js:
      `${DEFINE_MIXER}\n\n` +
      `const mixer = document.getElementById('scripted');\n` +
      `const frame = document.getElementById('scripted-frame');\n` +
      `const json = document.getElementById('scripted-json');\n` +
      `mixer.addEventListener('mx-unavailable', (e) => (frame.textContent = e.detail));\n` +
      `const ctx = await mixer.whenReady();\n\n` +
      `const actions = {\n` +
      `  mix: () => mixer.dispatch({ type: 'SET_TRANSITION_TYPE', transition: 'mix' }),\n` +
      `  wipe: () => {\n` +
      `    mixer.dispatch({ type: 'SET_TRANSITION_TYPE', transition: 'wipe' });\n` +
      `    mixer.dispatch({ type: 'SET_WIPE_PATTERN', number: 9 });\n` +
      `  },\n` +
      `  take: () => mixer.dispatch({ type: 'PRESS_AUTO_TAKE', tick: ctx.tick() }),\n` +
      `  mosaic: () => {\n` +
      `    mixer.dispatch({ type: 'SELECT_EFFECT_BUS', bus: 'B' });\n` +
      `    mixer.dispatch({ type: 'CHOOSE_EFFECT', effect: 'mosaic' });\n` +
      `    mixer.dispatch({ type: 'PRESS_EFFECT_ON' });\n` +
      `  },\n` +
      `  export: () => (json.textContent = mixer.exportPreset().slice(0, 240) + ' …'),\n` +
      `};\n` +
      `for (const button of document.querySelectorAll('#scripted-controls [data-cmd]')) {\n` +
      `  button.addEventListener('click', () => actions[button.dataset.cmd]());\n` +
      `}\n` +
      `mixer.onFrame((state, tick) => {\n` +
      `  frame.textContent = \`tick \${tick} · \${state.transition.type} · lever \${state.transition.lever.toFixed(2)}\`;\n` +
      `});`,
  }),
);

// ---------------------------------------------------------------- reference

const ref = section({ label: 'Reference', title: 'Everything the elements expose', id: 'reference' });
const refBody = body(ref);

function table(head: readonly string[], rows: readonly (readonly string[])[]): HTMLElement {
  const wrap = el('div', { class: 'mx-tablewrap', attrs: { style: 'margin:0 0 28px' } });
  const t = el('table', { class: 'mx-table' });
  t.innerHTML =
    `<thead><tr>${head.map((h) => `<th>${esc(h)}</th>`).join('')}</tr></thead>` +
    `<tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join('')}</tr>`).join('')}</tbody>`;
  wrap.appendChild(t);
  return wrap;
}

function subhead(text: string, note?: string): void {
  refBody.appendChild(el('h3', { text, attrs: { style: 'margin:0 0 6px' } }));
  if (note) refBody.appendChild(el('p', { class: 'mx-dim', html: note, attrs: { style: 'margin:0 0 12px;font-size:14px' } }));
}

subhead('<mx-mixer> attributes', `All optional. Rendered from ${srcLink('src/ui/mixer-api.ts', 'MIXER_ATTRIBUTES')}; a unit test fails if the element reads an attribute that is not listed here.`);
refBody.appendChild(table(['Attribute', 'Value', 'What it does'], MIXER_ATTRIBUTES.map((a) => [`<code>${esc(a.name)}</code>`, esc(a.value), esc(a.description)])));

subhead('Events');
refBody.appendChild(table(['Event', 'detail', 'When'], MIXER_EVENTS.map((e) => [`<code>${esc(e.name)}</code>`, esc(e.detail), esc(e.description)])));

subhead('Element members', 'For the page that composes the mixer. Components never see these; they get the context below.');
refBody.appendChild(table(['Member', 'What it does'], MIXER_MEMBERS.map((m) => [`<code>${esc(m.signature)}</code>`, esc(m.description)])));

subhead('The context', 'Everything a connected component receives, and nothing more. There is no renderer, no GPU device and no storage backend in it.');
refBody.appendChild(table(['Member', 'What it is'], MIXER_CONTEXT_MEMBERS.map((m) => [`<code>${esc(m.signature)}</code>`, esc(m.description)])));

subhead(
  'Blocks',
  `Each connects in one of three ways: as a descendant of a mixer, through <code>for="id"</code>, or with ` +
    `<code>block.bind(store, tick)</code> from script. An explicit <code>bind()</code> always wins.`,
);
refBody.appendChild(
  table(
    ['Element', 'Block', 'What it is', 'Manual', 'Spec'],
    BLOCK_TAGS.map((tag) => {
      const r = BLOCK_REFERENCE[tag]!;
      return [
        `<code>&lt;${esc(tag)}&gt;</code>`,
        esc(r.block),
        esc(r.summary),
        `reference ${esc(r.section)}`,
        `<a href="${REPO}/blob/main/features/${esc(r.feature)}">${esc(r.feature)}</a>`,
      ];
    }),
  ),
);
refBody.appendChild(
  el('p', {
    class: 'mx-dim',
    html:
      `And <code>&lt;mx-console&gt;</code>: all eleven on the hardware's plate layout, the same as the ` +
      `<code>controls</code> attribute. The design is recorded in ` +
      `<a href="${REPO}/blob/main/adr/0017-composable-embedding-host-element.md">ADR-0017</a>.`,
  }),
);
main.appendChild(ref);

// ---------------------------------------------------------------- primitives

const prims = section({ label: 'Layer 1 · no GPU', title: 'The controls on their own', id: 'primitives' });
body(prims).appendChild(
  el('p', {
    class: 'mx-prose',
    html:
      `Under the blocks sit five control primitives. They know nothing about the mixer: a value goes in through ` +
      `<code>setFromStore()</code> and comes out as a bubbling event. A block is these controls plus the code that ` +
      `turns their events into store commands. Each one below logs exactly what it emits.`,
    attrs: { style: 'margin-bottom:18px' },
  }),
);
body(prims).appendChild(document.createElement('mx-demo-primitives'));
body(prims).appendChild(
  codeBlock(
    `import { createSlider } from '${moduleUrl('src/ui/primitives/slider.js')}';\n\n` +
      `const level = createSlider({ label: 'Level' });\n` +
      `level.addEventListener('mx-input', (e) => console.log(e.detail)); // 0..1\n` +
      `level.setFromStore(0.5); // ignored while the user is dragging\n` +
      `document.body.append(level);`,
    'JavaScript',
  ),
);
main.appendChild(prims);

// ---------------------------------------------------------------- playground

const play = section({ label: 'Try it', title: 'Playground', id: 'playground' });
const playBody = body(play);
playBody.appendChild(
  el('p', {
    class: 'mx-prose',
    html:
      `Edit the HTML and press <strong>Run</strong>. It loads into a fresh document that imports from this site, ` +
      `the same as your own page would. Try adding <code>&lt;mx-mixwipe-block&gt;</code>, or replace the blocks with ` +
      `<code>controls</code> on the mixer.`,
    attrs: { style: 'margin-bottom:14px' },
  }),
);
const DEFAULT_PLAYGROUND =
  `<mx-mixer feeds="pattern" width="960" height="540"\n  preset="${presetUrl('dsk-title')}">\n` +
  `  <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:10px">\n` +
  `    <mx-dsk-block></mx-dsk-block>\n` +
  `    <mx-digital-effect-block></mx-digital-effect-block>\n` +
  `  </div>\n` +
  `</mx-mixer>\n\n` +
  `<script type="module">\n${indent(DEFINE_BOTH)}\n</script>`;
const playground = el('div', { class: 'mx-playground' });
const area = el('textarea', { attrs: { 'aria-label': 'Playground HTML', spellcheck: 'false' } });
area.value = DEFAULT_PLAYGROUND;
const playRow = el('div', { class: 'mx-row', attrs: { style: 'margin:10px 0' } });
const run = el('button', { class: 'mx-btn on', html: `<span class="led"></span>Run`, attrs: { type: 'button' } });
const reset = el('button', { class: 'mx-btn', text: 'Reset to the example', attrs: { type: 'button' } });
playRow.append(run, reset);
const frame = el('iframe', { attrs: { title: 'Playground output', allow: 'camera; microphone' } });
playground.append(area, playRow, frame);
playBody.appendChild(playground);
main.appendChild(play);

function runPlayground(): void {
  frame.srcdoc =
    `<!doctype html><html lang="en"><head><meta charset="utf-8">` +
    `<meta name="viewport" content="width=device-width, initial-scale=1">` +
    `<style>:root{color-scheme:dark}body{margin:0;padding:16px;background:#0b0c14;color:#e9e9ed;font:14px/1.5 system-ui,sans-serif}</style>` +
    `</head><body>${area.value}</body></html>`;
}
run.addEventListener('click', runPlayground);
reset.addEventListener('click', () => {
  area.value = DEFAULT_PLAYGROUND;
  runPlayground();
});
// The playground boots its own GPU device, so it waits for a click rather than starting with the page.
frame.srcdoc =
  `<!doctype html><html><head><meta charset="utf-8"><style>body{margin:0;display:grid;place-items:center;height:100vh;` +
  `background:#0b0c14;color:#6f7386;font:14px system-ui,sans-serif}</style></head><body>Press Run.</body></html>`;

const more = section({});
body(more).appendChild(
  el('p', {
    class: 'mx-prose mx-dim',
    html:
      `Want a full operator surface instead? <a href="${href('console/')}">The console</a> is ` +
      `<code>&lt;mx-mixer persist&gt;</code> plus <code>&lt;mx-console for="mixer"&gt;</code> and the source monitor wall. ` +
      `Its boot script, ${srcLink('src/main.ts')}, is the longest worked example of this API.`,
  }),
);
main.appendChild(more);
