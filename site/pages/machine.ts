// Route: /machine/
//
// The bulk of the descriptions and demos: one anchored section per signal stage, each a
// stack of four-pane block cards. Prose is written from docs/wj-mx50-feature-reference.md
// with section citations, so it carries the same provenance as the specs.

import { mountShell, section, body, el, href, blockCard } from '../shell.js';
import '../demos/sources.js';
import '../demos/matte.js';
import '../demos/effects.js';
import '../demos/positioner.js';
import '../demos/wipe.js';
import '../demos/transition.js';

const main = mountShell({ route: 'machine/' });

const intro = el('section');
intro.style.padding = '64px 0 8px';
const introWrap = el('div', { class: 'mx-wrap' });
introWrap.innerHTML = `
  <span class="mx-label">The Machine</span>
  <h1 style="margin:14px 0 18px;max-width:22ch">Every block, described and running.</h1>
  <p class="mx-prose" style="font-size:17px;color:var(--mx-label);max-width:62ch">
    Follow the signal: a source lands on a bus, gets corrected and effected per bus, meets the other
    bus at the Mix/Wipe stage, picks up a title, then fades. Each block below states what the hardware
    does, what this recreation models, and the scenario that pins it — with a live demo wherever the
    behaviour can be shown without a GPU.
  </p>
  <p class="mx-prose mx-dim" style="max-width:62ch">
    The audio mixer, Event Memory, Special Modes and the input layer sit off this path and live on
    <a href="${href('machine/audio-memory-control/')}">Audio, Memory &amp; Control</a>.
    Wipes get <a href="${href('machine/wipes/')}">a page of their own</a>.
  </p>`;
intro.appendChild(introWrap);
main.appendChild(intro);

// ---------------------------------------------------------------- sources

const sources = section({ label: 'Stage 1 · drawn endpoint', title: 'Sources & Matte', id: 'sources' });
body(sources).appendChild(
  blockCard({
    title: 'The two-bus source model',
    block: 'B-1',
    cite: 'reference §3',
    hardware: `<p>Two independent buses, A and B. Each selects one of four external Sources or the
      internal Matte generator. The same source may feed both buses; reselecting on a bus replaces
      whatever was there. Everything downstream — every effect, the transition, the key — operates on
      whatever these two buttons chose.</p>`,
    modelled: `<p>A bus is <code>{ source, substituteSource, colourCorrect }</code>. Matte is legal
      only at the Mix/Wipe stage; anywhere a real picture is required — keys, the DSK, fade, direct
      program out — a single resolver substitutes the bus's real source and the panel blinks that
      button to say so. One authority, consumed by every stage, so they cannot disagree.</p>`,
    demo: 'mx-demo-bus-board',
    sources: ['src/core/resolve.ts', 'src/state/reducer.ts'],
    spec: { feature: 'source-selection.feature', scenario: 'Matte is substituted where a function needs real video' },
  }),
);
body(sources).appendChild(
  blockCard({
    title: 'The Matte generator',
    block: 'B-2',
    cite: 'reference §4',
    hardware: `<p>A nine-colour internal generator — Colour Bar, White, then seven chromatic colours
      down to Black — cycled with a two-way SELECT. LEVEL adjusts chroma for the colours and
      brightness for White, and is ignored entirely by Colour Bar and Black. GRADATION ramps the
      matte vertically. It serves as a background, a wipe border colour, a key fill and a fade
      target.</p>`,
    modelled: `<p>The palette is a table in cycle order with a <code>kind</code> per entry, which is
      what makes LEVEL's colour-dependent meaning a lookup rather than a pile of conditionals. The
      gradient is a pure function of vertical position, so the same ramp math serves the shader and
      the specs.</p>`,
    demo: 'mx-demo-matte',
    sources: ['src/core/matte.ts'],
    spec: { feature: 'matte-generator.feature', scenario: 'For White, LEVEL adjusts brightness instead of chroma' },
  }),
);
main.appendChild(sources);

// ---------------------------------------------------------------- colour correction

const cc = section({ label: 'Stage 2 · per bus', title: 'Colour Correction', id: 'colour-correction' });
body(cc).appendChild(
  blockCard({
    title: 'Per-bus colour correction',
    block: 'B-4',
    cite: 'reference §6',
    hardware: `<p>One button cycles three states: off, CHROMA only, then CHROMA plus the RGB joystick.
      CHROMA at centre preserves saturation and at MIN yields black-and-white — from which the
      joystick casts a single mono tint. The two buses correct independently, so a mismatch produces a
      visible colour shift across a transition, and matching them keeps a transition clean.</p>`,
    modelled: `<p>Correction is per-bus state, applied at the second stage of the per-bus graph. The
      Mono digital effect overrides it on that bus and correction resumes when Mono is switched off —
      an ordering rule that is structural in the signal graph rather than a flag someone remembered
      to check.</p>`,
    sources: ['src/core/colour-correct.ts', 'src/gpu/shaders/bus-effect.wgsl.ts'],
    spec: { feature: 'color-correction.feature', scenario: 'From black-and-white the joystick casts a single mono tint' },
  }),
);
main.appendChild(cc);

// ---------------------------------------------------------------- digital effect

const de = section({ label: 'Stage 3 · per bus', title: 'Digital Effect', id: 'digital-effect' });
body(de).appendChild(
  blockCard({
    title: 'The four filters',
    block: 'C',
    cite: 'reference §8',
    hardware: `<p>Nega inverts like a film negative, Mosaic breaks the picture into solid blocks
      across 31 SIZE steps, Mono converts to black-and-white, and Paint posterises toward an oil
      painting. Choosing a bus alone changes nothing: the effect goes live only when ON is pressed,
      and it applies to one bus at a time.</p>`,
    modelled: `<p>The control surface is state; the pixels are a WGSL pass. What is modelled purely —
      and therefore testable headlessly — is which effect is live on which bus, what the SIZE and
      LEVEL controls mean, and how the effect interacts with colour correction.</p>`,
    demo: 'mx-demo-effect-numbers',
    sources: ['src/core/digital-effect.ts', 'src/gpu/bus-processor.ts'],
    spec: { feature: 'digital-effects-filters.feature', scenario: 'An effect applies to only one bus at a time' },
  }),
);
body(de).appendChild(
  blockCard({
    title: 'The freeze family and its exclusion rules',
    block: 'C',
    cite: 'reference §8.5–§8.8',
    hardware: `<p>Still holds a frame instantly. Strobe steps through frozen frames on the Effect
      Interval Timer. Multi splits the picture into 4, 9 or 16 tiles, filling them once or on repeat.
      Trail leaves a compressed live lead followed by up to sixteen ageing copies. Several of these
      cannot coexist: engaging one silently cancels another, and the panel's LEDs say which.</p>`,
    modelled: `<p>ADR-0007 makes the exclusions a state machine rather than scattered guards, which is
      why "engaging Still cancels a running Strobe" is a single tested transition. The trail geometry
      is pure: copy rectangles, the shrink ladder to the compression floor, and a per-spawn decay
      tuned so a copy reaches the drop floor after exactly sixteen spawns.</p>`,
    demo: 'mx-demo-trail',
    sources: ['src/core/digital-effect.ts', 'src/gpu/trail.ts'],
    spec: { feature: 'digital-effect-trail.feature', scenario: 'The trail is capped at 16 copies' },
  }),
);
main.appendChild(de);

// ---------------------------------------------------------------- positioner

const pos = section({ label: 'Stage 3b · per bus', title: 'Positioner & Scene Grabber', id: 'positioner' });
body(pos).appendChild(
  blockCard({
    title: 'Placing and freezing an inset',
    block: 'B-5',
    cite: 'reference §7',
    hardware: `<p>The Positioner engages only with Square-family wipe patterns, and switching away
      from one disengages it. Turning it on doubles the wiped size; the Mix/Wipe lever then sets the
      inset's size and the joystick places it anywhere on screen. SCENE GRABBER freezes the picture
      inside the inset, after which the joystick moves the still independently of the live video,
      holding its size.</p>`,
    modelled: `<p>Centre, size and half-extent are pure functions of joystick travel, the lever and
      the size control. Whether the result is a storable picture-in-picture — only a square-wipe PiP
      can go to Event Memory — is derived from the panel state, not tracked as a separate flag.</p>`,
    demo: 'mx-demo-positioner',
    sources: ['src/core/positioner.ts', 'src/gpu/wipe.ts'],
    spec: { feature: 'position-and-scene-grabber.feature', scenario: 'Pressing SCENE GRABBER freezes the image inside the inset' },
  }),
);
main.appendChild(pos);

// ---------------------------------------------------------------- mix/wipe

const mw = section({ label: 'Stage 4 · combine', title: 'Mix / Wipe', id: 'mix-wipe' });
body(mw).appendChild(
  blockCard({
    title: 'Transition types',
    block: 'D',
    cite: 'reference §9.2–§9.6',
    hardware: `<p>MIX cross-dissolves the two buses in proportion to lever travel. NAM composites by
      brightness, letting highlights punch through dark areas. WIPE runs the pattern engine. The
      Luminance and Chroma keys are transition <em>modes</em> on this desk, not a separate block: the
      B-bus is always the key source, the A-bus the background, and the lever scales the keyed
      foreground's opacity.</p>`,
    modelled: `<p>Each transition type selects a composite rule, and that rule becomes a single shader
      uniform. The weights are a pure function of the lever and always sum to one, which is what keeps
      a dissolve full-opacity throughout.</p>`,
    demo: 'mx-demo-transition',
    sources: ['src/core/transition.ts', 'src/core/key.ts'],
    spec: { feature: 'transition-mix-nam.feature', scenario: 'NAM at lever centre keeps the brighter of the two images per pixel' },
  }),
);
body(mw).appendChild(
  blockCard({
    title: 'The wipe engine',
    block: 'D',
    cite: 'reference §9.4',
    hardware: `<p>Seven pattern families, four variants each, composed with Compression, Slide, Multi,
      Pairing and Blinds, then dressed with a border or a soft edge and pointed in a direction. The
      Wipe Pattern Indicator shows the resulting number, and adding 128 gives the same wipe
      reversed.</p>`,
    modelled: `<p>Compositional, not a sprite table: the reveal geometry is computed per family and
      variant, and Compression and Slide are affine remaps handed to the shader as four numbers. The
      numbering is a pure oracle that round-trips.</p>`,
    demo: 'mx-demo-wipe-scope',
    sources: ['src/core/wipe.ts', 'src/gpu/shaders/wipe.wgsl.ts'],
    spec: { feature: 'wipe-patterns.feature', scenario: 'Adding 128 to a pattern number reverses that same wipe' },
  }),
);
const wipeMore = el('p', { class: 'mx-prose' });
wipeMore.innerHTML = `The wipe engine is the most involved piece of domain work here and gets
  <a href="${href('machine/wipes/')}">its own deep-dive</a> — including the pattern dialer, which
  answers RS-422 numbers using the shipping oracle.`;
body(mw).appendChild(wipeMore);
main.appendChild(mw);

// ---------------------------------------------------------------- dsk

const dsk = section({ label: 'Stage 5 · downstream', title: 'Downstream Key', id: 'downstream-key' });
body(dsk).appendChild(
  blockCard({
    title: 'The title keyer',
    block: 'E',
    cite: 'reference §10',
    hardware: `<p>The DSK keys on top of the finished composite — downstream of every effect and the
      transition, upstream only of Fade. Two level sliders define the luminance window that decides
      which pixels become title; the fill chooses what shows inside the characters; the key source
      chooses where the title luminance comes from, including a dedicated external camera input. EDGE
      cycles a six-state ring — Normal plus five border and shadow styles — and REVERSE inverts the
      key polarity.</p>`,
    modelled: `<p>The window, the edge ring and the polarity are pure state; the multi-tap border and
      shadow rendering is a WGSL pass driven by the edge geometry. The DSK's position in the chain is
      structural: it is a downstream stage in the signal graph, so it cannot accidentally be applied
      before the transition.</p>`,
    sources: ['src/core/dsk.ts', 'src/gpu/shaders/dsk.wgsl.ts'],
    spec: { feature: 'downstream-key.feature', scenario: 'The EDGE button cycles through the five edge styles in order' },
  }),
);
main.appendChild(dsk);

// ---------------------------------------------------------------- fade

const fade = section({ label: 'Stage 6 · downstream', title: 'Fade', id: 'fade' });
body(fade).appendChild(
  blockCard({
    title: 'The final stage',
    block: 'F',
    cite: 'reference §12',
    hardware: `<p>Three independent enables — VIDEO, DSK and AUDIO — decide what participates, and a
      target decides what the picture fades <em>to</em>: Matte, White, Black, or one of the two buses.
      Fading to a bus reveals that clean bus and keeps its audio; fading to matte, white or black
      silences the programme. Fading VIDEO only leaves the title on screen; fading DSK only removes
      the title while the picture stays. Headphone monitoring never fades.</p>`,
    modelled: `<p>Five targets, three independent enables, and a fade level applied after the DSK —
      the last stage in the downstream graph. The selective cases are the interesting ones, because
      they require the renderer to fade the pre-DSK composite by one amount while the title element
      rides the key mask at another.</p>`,
    sources: ['src/core/fade.ts', 'src/gpu/shaders/fade.wgsl.ts'],
    spec: { feature: 'fade-control.feature', scenario: 'Fading VIDEO only leaves the DSK title on screen' },
  }),
);
main.appendChild(fade);

// ---------------------------------------------------------------- program out

const po = section({ label: 'Endpoint · drawn', title: 'Program Out', id: 'program-out' });
body(po).appendChild(
  blockCard({
    title: 'What actually leaves the desk',
    cite: 'reference §2',
    hardware: `<p>Three program modes. EFFECT sends the fully processed composite. A and B send that
      bus directly, bypassing the entire effect chain — a clean feed. Preview always carries the
      effected signal regardless, which is what lets an operator set up an effect while sending
      something clean to air.</p>`,
    modelled: `<p>Program mode is one field, and the "direct out bypasses everything" rule is a
      property of how the program stage reads the graph rather than a second rendering path. The
      audio follows the same rule: direct out carries that bus plus aux and mic, and only EFFECT
      passes the full mix through the master fader.</p>`,
    sources: ['src/core/program.ts'],
    spec: { feature: 'program-output.feature', scenario: 'Preview lets me monitor the effect while sending a clean bus to program' },
  }),
);
const consoleCta = el('div', { class: 'mx-panel mx-card' });
consoleCta.innerHTML = `
  <h3 style="margin:0 0 8px">See it all at once</h3>
  <p class="mx-dim" style="margin:0 0 14px">The blocks above are one console. Run the real thing —
  four live procedural feeds, the lever, the effects, the keyer.</p>
  <a class="mx-cta" href="${href('console/')}"><span class="led"></span>Launch the console</a>`;
body(po).appendChild(consoleCta);
main.appendChild(po);
