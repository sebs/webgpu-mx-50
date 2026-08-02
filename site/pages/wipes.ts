// Route: /machine/wipes/
//
// The showpiece deep-dive. Everything here runs without a GPU, which is the point: the
// compositional claim is provable from the domain code alone.

import { mountShell, section, body, el, href, srcLink } from '../shell.js';
import '../demos/wipe.js';

const main = mountShell({ route: 'machine/wipes/' });

const intro = el('section');
intro.style.padding = '64px 0 8px';
const introWrap = el('div', { class: 'mx-wrap' });
introWrap.innerHTML = `
  <span class="mx-label">The Machine · deep dive</span>
  <h1 style="margin:14px 0 18px;max-width:20ch">The wipe engine</h1>
  <p class="mx-prose" style="font-size:17px;color:var(--mx-label);max-width:62ch">
    A wipe on this desk is not a picture pulled from a table of shapes. It is
    <strong style="color:var(--mx-text)">composed</strong>: seven families, four variants each,
    modified by Compression, Slide, Multi, Pairing and Blinds, dressed with a border or a soft edge,
    and pointed in a direction. The pattern number on the indicator is a consequence of those
    choices, not a lookup key.
  </p>
  <p class="mx-prose mx-dim" style="max-width:62ch">
    Every demo on this page is pure domain code. No WebGPU is involved in any of it.
  </p>`;
intro.appendChild(introWrap);
main.appendChild(intro);

// ---------------------------------------------------------------- claim

const claim = section({ label: '1 · The claim', title: 'Composition, not a sprite sheet' });
body(claim).appendChild(
  el('div', {
    class: 'mx-prose',
    html:
      `<p>Seven families — straight, corner, diagonal, triangle, split, mosaic and square — each with
       four variants, gives 28 forward patterns. Reversal is the same wipe with 128 added to its
       number, so the addressable space is 28 forward plus 28 reversed. On top of that sit modifiers
       that change how the two pictures are <em>sampled</em> rather than which region is revealed:</p>
      <ul>
        <li><strong>Compression</strong> — the affected side samples a whole, scaled-down copy of its
        frame instead of a crop. Pressed once it compresses the incoming scene; twice, both.</li>
        <li><strong>Slide</strong> — the incoming frame translates so its trailing edge rides the
        boundary. Pressed twice, both images slide over each other.</li>
        <li><strong>Multi</strong> — the pattern repeats up to six times across the frame.</li>
        <li><strong>Pairing</strong> — a mirrored second copy of the wipe scene.</li>
        <li><strong>Blinds</strong> — the reveal becomes venetian strips. Legal on five of the seven
        families; requesting it on the others is rejected rather than approximated.</li>
      </ul>
      <p>Because the geometry is computed rather than stored, a variant that nobody drew still
      behaves correctly — and the shader receives the same four affine numbers regardless of which
      combination produced them.</p>`,
  }),
);
main.appendChild(claim);

// ---------------------------------------------------------------- scope

const scope = section({ label: '2 · What the shader is told', title: 'The geometry scope' });
body(scope).appendChild(
  el('p', {
    class: 'mx-prose',
    html:
      `This is not a picture of a wipe — it is a picture of the <em>instructions</em>. The amber
       rectangle is the reveal envelope for the current family, variant and lever position; the dashed
       grid is where the incoming frame gets sampled from once Compression or Slide remaps it. Drag
       the lever and watch both move.`,
  }),
);
body(scope).appendChild(document.createElement('mx-demo-wipe-scope'));
main.appendChild(scope);

// ---------------------------------------------------------------- dialer

const dialer = section({ label: '3 · The numbering oracle', title: 'The pattern dialer' });
body(dialer).appendChild(
  el('div', {
    class: 'mx-prose',
    html:
      `<p>Edit controllers address wipes by number over RS-422 (001–255), and the AG-A800 reaches
       01–99 with 99 meaning "whatever is currently set up". Type a number and the shipping oracle
       answers: which family and variant it decomposes to, whether it is reversed, whether it
       round-trips, and what an external controller would make of it.</p>
       <p>Note what happens outside 1–28 and 129–156. The engine composes 28 forward patterns, so
       <code>numberToPattern</code> throws elsewhere rather than inventing an answer — and the demo
       says so instead of hiding it. An honest readout about the edge of the model is worth more than
       a plausible fabrication.</p>`,
  }),
);
body(dialer).appendChild(document.createElement('mx-demo-wipe-dialer'));
main.appendChild(dialer);

// ---------------------------------------------------------------- edges

const edges = section({ label: '4 · Dressing and direction', title: 'Edges, borders and travel' });
body(edges).appendChild(
  el('div', {
    class: 'mx-prose',
    html:
      `<p>BORDER cycles narrow → wide → off and paints the <em>complement</em> of the current Matte
       colour, so changing the matte recolours a live border. SOFT feathers the edge across two widths
       and ignores the matte entirely. The two are mutually exclusive edge treatments — you get a
       border or a feather, never both.</p>
      <p>Direction has its own logic. By default the wipe alternates direction on each lever swing;
      ONE-WAY makes every swing travel the same way; REVERSE mirrors it. ONE-WAY combined with
      REVERSE produces symmetrical wiping, which is a distinct behaviour rather than the sum of its
      parts — and is pinned as such.</p>
      <p>ASPECT stretches a Square-family pattern along one axis and has no effect on the other
      families, which is why the reveal rectangle for a square takes an aspect argument while the
      others ignore it.</p>`,
  }),
);
const src = el('p', { class: 'mx-dim' });
src.innerHTML = `Source: ${srcLink('src/core/wipe.ts')} · ${srcLink('src/gpu/shaders/wipe.wgsl.ts')} ·
  specs: ${srcLink('features/wipe-patterns.feature')}, ${srcLink('features/wipe-edge-and-direction.feature')} ·
  <a href="${href('specs/')}?q=wipe">open the wipe scenarios &rarr;</a>`;
body(edges).appendChild(src);
main.appendChild(edges);

// ---------------------------------------------------------------- gpu note

const gpu = section({ label: 'Still to come', title: 'The wipe wall' });
body(gpu).appendChild(
  el('div', {
    class: 'mx-prose',
    html:
      `<p>The one demo this page is missing is the obvious one: all 28 forward patterns running live
       on real video in a grid, click one to enlarge. That needs the WebGPU bench harness — a shared
       device across several canvases and the procedural feed patterns extracted from the console's
       monitor wall — which is scheduled work, not finished work.</p>
       <p class="mx-dim">The renderer itself already draws every one of these patterns; what is
       missing is the site-side harness. See <a href="${href('status/')}">Status</a> for the full
       inventory of what is and is not built here.</p>`,
  }),
);
main.appendChild(gpu);
