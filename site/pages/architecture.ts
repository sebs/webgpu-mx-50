// Route: /architecture/
//
// Reference description of the five architectural layers, each followed by the demo that
// exercises it. Prose is kept terse and factual — types, call names, file paths.

import { mountShell, section, body, el, srcLink, REPO, loadGenerated } from '../shell.js';
import '../demos/store.js';
import '../demos/spine.js';
import '../demos/timing.js';

const main = mountShell({ route: 'architecture/' });

const intro = el('section');
intro.style.padding = '64px 0 8px';
const introWrap = el('div', { class: 'mx-wrap' });
introWrap.innerHTML = `
  <h1 style="margin:0 0 18px;max-width:24ch">Architecture</h1>
  <p class="mx-prose" style="font-size:17px;color:var(--mx-label);max-width:64ch">
    Vanilla TypeScript, no framework, no bundler. One state store, an explicit signal graph, a
    fixed-timestep clock, a WebGPU render path, and a headless test layer. Each section below
    describes one layer and includes a demo running the actual module.
  </p>
  <p class="mx-prose mx-dim" style="max-width:64ch">
    Long form: ${srcLink('docs/architecture.md', 'docs/architecture.md')}. Decision records:
    <a href="${REPO}/tree/main/adr">adr/</a> (16 ADRs).
  </p>`;
intro.appendChild(introWrap);
main.appendChild(intro);

function layer(opts: { adr: string; title: string; prose: string; demo?: string; id: string }): HTMLElement {
  const s = section({ label: opts.adr, title: opts.title, id: opts.id });
  const b = body(s);
  b.appendChild(el('div', { class: 'mx-prose', html: opts.prose }));
  if (opts.demo) {
    const panel = el('div', { class: 'mx-panel mx-card' });
    panel.style.marginTop = '20px';
    panel.appendChild(document.createElement(opts.demo));
    b.appendChild(panel);
  }
  return s;
}

main.appendChild(
  layer({
    adr: 'ADR-0011',
    id: 'store',
    title: 'State store',
    prose:
      `<p>The panel is one <code>PanelState</code> object: buses, matte, digital effect, transition,
       positioner, DSK, audio, fade, program-out mode, transition frames, system, memory bank and
       special mode. It is JSON-serialisable, with no handles and no cycles.</p>
      <p>Writes go through <code>PanelStore.dispatch(command)</code>. <code>Command</code> is a
       discriminated union of 75 command types; <code>reduce(state, command)</code> is pure and
       returns a new snapshot, or the same reference when the command is a no-op — in which case
       subscribers are not notified. Subscribers are read-only and run after the commit.</p>
      <p>Three consequences follow from the shape rather than from extra code. An Event Memory slot
       is a copy of the state minus <code>memory</code> and <code>specialMode</code>, so slots
       cannot nest. Persistence is <code>JSON.stringify</code> over the same value. The input layer
       only has to emit commands.</p>`,
    demo: 'mx-demo-store',
  }),
);

main.appendChild(
  layer({
    adr: 'ADR-0004',
    id: 'graph',
    title: 'Signal graph',
    prose:
      `<p>Stage order is declared in <code>src/core/signal-graph.ts</code>:
       <code>PER_BUS_STAGES = ['colour-correction', 'digital-effect']</code>,
       <code>COMBINE_STAGE = 'mix-wipe'</code>,
       <code>DOWNSTREAM_STAGES = ['downstream-key', 'fade']</code>, composed into
       <code>STAGE_ORDER</code>. <code>stageIsBefore(a, b)</code> answers ordering questions from
       that array.</p>
      <p>Per-bus stages run twice, once per bus, before the combine stage merges them; downstream
       stages run once on the result. The renderer builds its passes from this order, so a pass
       cannot execute out of sequence.</p>
      <p><code>STAGE_ORDER</code> contains the five processing stages only. Source selection and
       Program Out are endpoints, not stages, and the diagram below draws them as such.</p>`,
    demo: 'mx-demo-spine',
  }),
);

main.appendChild(
  layer({
    adr: 'ADR-0012',
    id: 'clock',
    title: 'Clock and timing',
    prose:
      `<p><code>LogicalClock</code> advances in whole video-frame ticks. <code>accumulate(deltaMs)</code>
       adds to an accumulator and steps one tick per <code>TICK_MS</code> contained in it, returning
       the number of ticks stepped. <code>subTickAlpha</code> exposes the remainder in [0, 1) for
       display interpolation, which does not advance logical state.</p>
      <p>Transition runners store absolute ticks — <code>startTick</code>, <code>lastTick</code>,
       <code>pausedTicks</code> — and compute
       <code>progress = (tick − startTick − pausedTicks) / durationTicks</code>. Because progress is
       absolute rather than incremental, one multi-tick advance equals N single-tick advances, and
       pausing accumulates elapsed ticks instead of storing a timestamp.</p>
      <p>The TRANSITION control is quantised by <code>quantizeTransitionFrames</code>: clamped to
       0–510, then floored to a 2-frame step (1 → 0, 3 → 2, 61 → 60). One frame is one tick.</p>
      <p>The demo runs two clocks fed identical elapsed time in 60 Hz and 144 Hz slices. Frame
       counters and lever positions stay equal; the drift readouts show the difference.</p>`,
    demo: 'mx-demo-determinism',
  }),
);

main.appendChild(
  layer({
    adr: 'ADR-0002 · ADR-0007',
    id: 'render',
    title: 'Render path',
    prose:
      `<p>WebGPU, one pass per signal-graph stage, WGSL in <code>src/gpu/shaders/</code>. A
       <code>BusProcessor</code> runs colour correction and digital effects per bus; the wipe pass
       composites the two buses using a combine mode and, for wipes, affine sample remaps computed
       on the CPU in <code>src/core/wipe.ts</code>; DSK and fade passes follow.</p>
      <p>Frame memory for the freeze family (Still, Strobe, Multi, Trail) lives in GPU textures.
       Trail uses a ping-pong accumulator: copy geometry and decay come from
       <code>trailCopyRect</code> / <code>trailCopyWeight</code>, so the shader does not duplicate
       the layout math.</p>
      <p>An <code>rAF</code> present loop drives the clock and calls the renderer. The renderer
       reads <code>store.getSnapshot()</code> once per frame and never writes to it.</p>`,
  }),
);

main.appendChild(
  layer({
    adr: 'ADR-0016',
    id: 'tests',
    title: 'Testing',
    prose:
      `<p>Two layers. <code>cucumber-js</code> executes the <code>.feature</code> files against the
       domain modules with no DOM and no GPU; the test World builds a store, a clock and the source
       registries, and steps dispatch commands. <code>node:test</code> units cover pure functions —
       the wipe numbering oracle, pattern legality, gain curves, timeline quantisation.</p>
      <p>A third tier renders individual shader passes and compares them to reference images by
       SSIM. It is wired into <code>npm test</code> and skips when no headless WebGPU adapter is
       present, which is the case in CI today.</p>
      <p data-gate>Gate counts are generated from the feature files at build time. The scenarios that
       do not execute are tagged <code>@deferred</code> or <code>@wip</code>, or are excluded by the
       include-list in <code>test/cucumber.mjs</code>.</p>`,
  }),
);

// ---------------------------------------------------------------- build

const build = section({ label: 'ADR-0003', title: 'Build', id: 'build' });
body(build).appendChild(
  el('div', {
    class: 'mx-prose',
    html:
      `<p>All imports in <code>src/</code> are relative and end in <code>.js</code>. There are no
       bare specifiers, so the page needs no import map: <code>index.html</code> loads one
       <code>&lt;script type="module"&gt;</code> and the browser resolves the graph.</p>
      <p><a href="https://github.com/sebs/banira">banira</a> provides the dev server, which
       transpiles TypeScript on request and maps <code>.js</code> specifiers to <code>.ts</code>
       sources, and <code>banira compile</code>, which emits the same tree as JavaScript. No
       bundler is used in development or production.</p>
      <p>This site is compiled from the same tree: one entry module per route, with demos importing
       the domain modules from <code>../src/</code>. Output is <code>_site/site/…</code> beside
       <code>_site/src/…</code>, specifiers unchanged.</p>
      <p>banira's compile step uses a pre-ES2016 standard library, so
       <code>Array.prototype.includes</code>, <code>String.prototype.padStart</code> and similar
       methods are unavailable in <code>src/</code> and <code>site/</code> even though
       <code>tsc</code> accepts them.</p>`,
  }),
);

// Gate counts come from the build-time artifact, never from prose.
void loadGenerated<{ scenarios: { authored: number; executed: number }; steps: { executed: number } }>(
  'stats.json',
).then((stats) => {
  if (!stats) return;
  const p = document.querySelector('[data-gate]');
  if (!p) return;
  p.innerHTML =
    `Current gate: <strong>${stats.scenarios.executed}</strong> of ${stats.scenarios.authored} authored ` +
    `scenarios execute (${stats.steps.executed} steps). The remainder are tagged <code>@deferred</code> or ` +
    `<code>@wip</code>, or are excluded by the include-list in <code>test/cucumber.mjs</code>.`;
});

const stack = el('div', { class: 'mx-tablewrap' });
stack.innerHTML = `<table class="mx-table">
  <thead><tr><th>Layer</th><th>Implementation</th><th>ADR</th></tr></thead>
  <tbody>
    <tr><td>UI</td><td>Native Web Components, authored CSS, inline SVG. No framework, no CDN, no web fonts.</td><td>0003, 0013</td></tr>
    <tr><td>State</td><td>One store, one pure reducer, typed command union</td><td>0011</td></tr>
    <tr><td>Engine</td><td>Fixed-timestep logical clock under an rAF present loop</td><td>0012</td></tr>
    <tr><td>Render</td><td>WebGPU passes + WGSL, one per signal-graph stage</td><td>0002, 0004</td></tr>
    <tr><td>Audio</td><td>Web Audio, gesture-attached, per-source taps</td><td>0010</td></tr>
    <tr><td>Input</td><td>Binding table → logical control → resolver → command</td><td>0014</td></tr>
    <tr><td>Persistence</td><td>Schema-versioned localStorage, IndexedDB blob tier for stills</td><td>0015</td></tr>
    <tr><td>Tests</td><td>cucumber-js over features/, node:test units, golden SSIM tier</td><td>0016</td></tr>
  </tbody></table>`;
body(build).appendChild(stack);
main.appendChild(build);
