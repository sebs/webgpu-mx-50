// Route: /architecture/
//
// Four claims, each with a demo that proves it rather than a paragraph that asserts it —
// plus the build story, which is the unusual part.

import { mountShell, section, body, el, srcLink, href, REPO } from '../shell.js';
import '../demos/store.js';
import '../demos/spine.js';
import '../demos/timing.js';

const main = mountShell({ route: 'architecture/' });

const intro = el('section');
intro.style.padding = '64px 0 8px';
const introWrap = el('div', { class: 'mx-wrap' });
introWrap.innerHTML = `
  <span class="mx-label">How it's built</span>
  <h1 style="margin:14px 0 18px;max-width:24ch">Four claims, each with a demo that proves it.</h1>
  <p class="mx-prose" style="font-size:17px;color:var(--mx-label);max-width:62ch">
    The interesting part of this experiment is the architecture, not the artwork. Below are the four
    load-bearing decisions — and rather than assert them, each one comes with something you can
    operate to check it.
  </p>
  <p class="mx-prose mx-dim" style="max-width:62ch">
    The long-form version lives in ${srcLink('docs/architecture.md', 'docs/architecture.md')}; the
    decisions themselves are on <a href="${href('decisions/')}">Decisions</a>.
  </p>`;
intro.appendChild(introWrap);
main.appendChild(intro);

function claim(opts: { n: string; adr: string; title: string; prose: string; demo?: string; id: string }): HTMLElement {
  const s = section({ label: `${opts.n} · ${opts.adr}`, title: opts.title, id: opts.id });
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
  claim({
    n: 'Claim 1',
    adr: 'ADR-0011',
    id: 'store',
    title: 'One pure store',
    prose:
      `<p>The entire panel is a single JSON-serialisable value, and every change is a typed command
       through one pure reducer. Snapshots are immutable; the reducer returns the <em>same</em>
       reference for a no-op, so a command that changes nothing notifies nobody.</p>
      <p>That constraint is what makes three other features thin rather than hard. Event Memory is a
       copy of the value. Persistence is a stringify. The input layer only has to produce commands.
       And because a snapshot has no handles and no cycles, a stored slot can never transitively
       contain slots.</p>
      <p>Press anything below and watch the diff — including the case where the reducer declines.</p>`,
    demo: 'mx-demo-store',
  }),
);

main.appendChild(
  claim({
    n: 'Claim 2',
    adr: 'ADR-0004',
    id: 'graph',
    title: 'An explicit signal graph',
    prose:
      `<p>The hardware's block order is fixed, so in the code it is structural rather than
       conventional: per-bus stages, then the combine stage, then the downstream stages, composed
       into one order that the renderer walks. A stage cannot be applied out of turn because there is
       nowhere to express that.</p>
      <p>The diagram below reads that order out of the module at page load. Note the honesty in the
       labels: the five middle nodes are generated, while the Source and Program Out endpoints are
       drawn — the stage list does not include them, and pretending otherwise would be the kind of
       drift this whole approach exists to prevent.</p>`,
    demo: 'mx-demo-spine',
  }),
);

main.appendChild(
  claim({
    n: 'Claim 3',
    adr: 'ADR-0012',
    id: 'clock',
    title: 'A deterministic clock',
    prose:
      `<p>Logical time advances in whole video-frame ticks fed by an accumulator, decoupled from
       display refresh. Everything time-dependent reads that clock and nothing else, so a 300-frame
       Auto Fade behaves identically at 60 Hz and 144 Hz — and a test can step it directly with no
       rAF and no wall clock.</p>
      <p>The runner math is absolute in ticks rather than incremental, which is why a multi-tick
       catch-up in one present frame lands exactly where k single steps would, and why pausing
       accumulates paused ticks instead of freezing a timestamp.</p>
      <p>Below, two clocks are fed the same elapsed time in different refresh slices. The drift
       readouts are the claim.</p>`,
    demo: 'mx-demo-determinism',
  }),
);

main.appendChild(
  claim({
    n: 'Claim 4',
    adr: 'ADR-0016',
    id: 'specs',
    title: 'Headless-first, spec-driven testing',
    prose:
      `<p>The Gherkin files in <code>features/</code> are not documentation that shadows the code —
       they execute against the real domain modules with no GPU and no DOM. Behaviour is verified
       against the manual, not against a screenshot, which is what makes "high behavioural fidelity"
       a claim you can check rather than a boast.</p>
      <p>ADR-0016 has a second half worth naming: a golden-image/SSIM tier that renders individual
       shader passes and compares them to committed references. It is wired into the gate and it
       <em>skips</em> here, because this environment has no headless-WebGPU adapter. That is an
       environment limit rather than a code limit, and saying so is better than quietly omitting the
       tier.</p>
      <p><a href="${href('specs/')}">Browse all the scenarios &rarr;</a></p>`,
  }),
);

// ---------------------------------------------------------------- build story

const build = section({ label: 'The build', title: 'No bundler, and no import map either', id: 'build' });
body(build).appendChild(
  el('div', {
    class: 'mx-prose',
    html:
      `<p>The app ships as native ES modules with <strong>all-relative specifiers</strong>. There are
       zero bare imports in <code>src/</code>, so there is no import map in the page and nothing to
       resolve at runtime — one <code>&lt;script type="module"&gt;</code> and the browser follows the
       graph. <a href="${REPO}/blob/main/index.html">The page shell</a> is 73 lines, most of it a
       capability check.</p>
      <p><a href="https://github.com/sebs/banira">banira</a> provides the dev server, which transpiles
       TypeScript on the fly and maps <code>.js</code> specifiers back to <code>.ts</code> sources,
       and the compile step that emits the same tree as plain JavaScript. No bundler is involved at
       any point, in development or in production (ADR-0003).</p>
      <p>This site is built the same way, from the same tree: each route is a real directory with its
       own entry module, and the demos <code>import</code> the actual domain modules out of
       <code>../src/</code> rather than copying them. If a demo cannot be built by importing the real
       module, that is a finding about the module — not a licence to mock it.</p>
      <p class="mx-dim">One sharp edge worth recording: banira's compile step uses a pre-ES2016
       library, so <code>Array.prototype.includes</code> and friends are unavailable even though
       <code>tsc</code> accepts them. Both <code>src/</code> and <code>site/</code> use
       <code>indexOf</code> instead.</p>`,
  }),
);

const stack = el('div', { class: 'mx-tablewrap' });
stack.innerHTML = `<table class="mx-table">
  <thead><tr><th>Layer</th><th>What it is</th><th>Notes</th></tr></thead>
  <tbody>
    <tr><td>UI</td><td>Native Web Components, authored CSS, inline SVG</td><td>No framework, no CDN, no web fonts — offline-capable (ADR-0003/0013)</td></tr>
    <tr><td>State</td><td>One store, one reducer, typed commands</td><td>ADR-0011</td></tr>
    <tr><td>Engine</td><td>Fixed-timestep clock under an rAF present loop</td><td>ADR-0012</td></tr>
    <tr><td>Render</td><td>WebGPU passes + WGSL, one per signal-graph stage</td><td>ADR-0002/0004</td></tr>
    <tr><td>Audio</td><td>Web Audio, gesture-attached</td><td>ADR-0010</td></tr>
    <tr><td>Persistence</td><td>Schema-versioned localStorage + an IndexedDB blob tier</td><td>ADR-0015</td></tr>
    <tr><td>Tests</td><td>node:test units + cucumber-js over the real feature files</td><td>ADR-0016</td></tr>
  </tbody></table>`;
body(build).appendChild(stack);
main.appendChild(build);
