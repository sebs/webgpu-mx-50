# Development

How to run, test, and build web-mx-50 — the app and its website. Phase history is in
[ROADMAP.md](ROADMAP.md); what is not built is in [DEFERRED.md](DEFERRED.md).

## Prerequisites

- Node.js ≥ 20 (developed on 22.x).
- A WebGPU-capable browser to view the app: Chrome/Edge 113+, Safari 18+, or Firefox
  with WebGPU enabled (ADR-0002). No WebGPU → the app shows a graceful capability
  message instead of a blank canvas.

## Install

```bash
npm install
```

## Run the app (dev)

```bash
npm run dev
```

Runs `banira dev` (ADR-0003): watches `src/`, serves the project root at
<http://127.0.0.1:8080> with live reload, and transpiles TypeScript on the fly (`--ts`,
so `./foo.js` imports resolve to `foo.ts` — no build step). Open the URL in a WebGPU
browser: you get the full operator surface — four live procedural Source feeds on the
monitor wall, the Program monitor, and the console (`index.html` composes
`<mx-mixer persist>` + `<mx-console for="mixer">`; `src/main.ts` wires the rest).

## Test

```bash
npm test           # typecheck + unit + features + golden (the full gate)

npm run typecheck    # tsc --noEmit
npm run test:unit    # node:test — pure engine/domain logic (clock, store, reducer, bindings, graph)
npm run test:features# cucumber-js — the ./features specs against the headless engine
npm run test:golden  # golden-image/SSIM scaffolding; SKIPS where no WebGPU adapter (ADR-0016)
```

The Gherkin layer (ADR-0016) executes the real `.feature` files in
[`../features`](../features) against the headless engine. `test/cucumber.mjs` holds the
include-list: every scenario that executes in CI is named there, and the authored-but-deferred
remainder is accounted for in [DEFERRED.md](DEFERRED.md). Unit tests run TypeScript directly via
`tsx`; besides the domain they cover the site's authored content (bench looks, the tour, recipe
playback, share links) and drift guards for the documented embedding API.

## Build (no-bundler production output)

```bash
npm run build      # banira compile src/main.ts --output dist
```

Emits ES modules to `dist/` (banira follows the import graph from `main.ts`). There is
no bundler by design (ADR-0003), and no import map either: every specifier in `src/` is
relative, so the output runs as-is. A bundling/minification pass is a deferred, additive step.

**banira's compile lib floor is older than `tsc`'s.** `npm run typecheck` passes code that
`banira compile` rejects — anything past ES2015-ish: `Array.prototype.includes`,
`String.prototype.padStart`, `Promise.prototype.finally`, `**`. Use `indexOf`, manual padding,
and `.then(f, f)`; `npm run build` / `npm run site:build` are what catch it.

## The website

```bash
npm run site:build    # site:data (generated JSON + presets) then banira compile → _site/
npm run site:serve    # build, then serve _site/
npm run site:check    # every module specifier and fetched asset resolves
npm run site:smoke    # every route in headless Chrome without a GPU: no errors, every bench falls back
npm run site:posters  # maintainer step, needs a WebGPU Chrome: re-capture stills, loops, social card
```

Concept and status: [WEBSITE.md](WEBSITE.md). The site imports `src/` rather than copying it;
its authored interactive content (`site/looks.ts`, `site/tour.ts`, `site/recipes.ts`) is plain
data of store commands, checked against the reducer by the unit suite. Re-run `site:posters`
when a look or the renderer changes and commit the result: CI cannot render a frame.

## Project layout

```
index.html              The console page: <mx-mixer persist> + <mx-console for="mixer">
src/
  main.ts               Browser entry for the console: monitor wall, audio, input adapters, chrome
  app.ts                Headless engine assembly (store + clock + bindings) — what tests build
  constants.ts          Canonical timing + colour constants (ADR-0005, ADR-0012)
  core/                 Pure domain logic, one module per hardware block (transition, wipe, dsk,
                        fade, matte, positioner, digital-effect, audio, event-memory, special-mode,
                        signal-graph, resolve, program, …) — DOM-free, GPU-free, spec-pinned
  state/
    state.ts            PanelState + FACTORY_PRESET + the field-preset sanitiser
    commands.ts         The typed Command vocabulary — the one way anything changes
    reducer.ts          The single pure reducer (ADR-0011)
    store.ts            PanelStore: dispatch / subscribe / getSnapshot
  engine/
    clock.ts            Fixed-timestep logical clock (ADR-0012)
    loop.ts             rAF present loop over the clock
    renderer.ts         The GPU signal graph: per-bus → combine → DSK → fade → present
  gpu/
    capabilities.ts     WebGPU feature detection + graceful message (ADR-0002)
    device.ts           Device acquisition (per host, or one shared per page) + sRGB swapchain
    bus-processor.ts    Per-bus colour correction + filters + freeze family (reference §6, §8)
    trail.ts            Trail ping-pong accumulator (reference §8.8)
    combine.ts          Mix/NAM/key combine pass (reference §9.1–§9.6)
    wipe.ts             Compositional wipe pass, Positioner inset, Scene Grabber (reference §7, §9.4)
    dsk.ts              Downstream Key pass, six edge styles (reference §10)
    fade.ts             Fade pass, selective VIDEO/DSK (reference §11)
    special-fx.ts       Special-Mode compressed-image macros (reference §14)
    present.ts          Blit Program Out to the canvas' sRGB view
    readback.ts         256-aligned texture readback (still capture)
    shaders/*.wgsl.ts   WGSL string modules
  sources/              The Source abstraction (ADR-0008): video / image / camera / matte /
                        generated sources, the registry, bindings, device catalog
  audio/
    engine.ts           Browser Web Audio graph, gains driven by the store (ADR-0010)
    av-synchro-tap.ts   Runtime envelope tap → A/V-Synchro effect gate (browser-only)
  persistence/
    backend.ts          StorageBackend / BlobBackend: localStorage, IndexedDB, in-memory (ADR-0015)
    schema.ts           schemaVersion envelope, migration, crash-proof reads
    persistence.ts      The single owner of storage: bank / field-preset / settings / bindings / import-export
    subscriber.ts       Passive store→storage mirror (debounced field-preset capture)
    still-store.ts      Two-tier still commits (blob first), orphan sweep
    preset-file.ts      Pure half of preset file import/export; file-io.ts is the DOM half
  control/
    logical-control.ts  Remappable logical-control ids + the ControlSignal shape (ADR-0014)
    bindings.ts         BindingTable + default bindings (physical address → control)
    resolver.ts         The sole command emitter: resolveSignal + the per-tick SignalCoalescer
    keyboard.ts         Pure key-chord resolution + the browser KeyboardAdapter (focus-guarded)
    automation.ts       Local automation API (RS422/RS232C intent): run transition / call pattern / step memory / CC / DSK
    learnable.ts        MIDI learn (ADR-0018)
    gamepad.ts,midi.ts,serial.ts  Browser-only input adapters (capability-detected, excluded from CI)
  ui/
    mixer.ts            <mx-mixer>: the host that owns engine, GPU and loop (ADR-0017)
    mixer-api.ts        The documented embedding surface as data (attributes, events, members)
    context.ts          The context-request protocol connected components resolve
    console.ts          <mx-console>: every block on the plate layout
    blocks/             One connected custom element per hardware block; reference.ts = provenance
    primitives/         mx-slider / mx-fader / mx-tbar / mx-joystick — value in, event out
    pattern-feeds.ts    The four procedural Source clips (used by the wall and by feeds="pattern")
    demo-feeds.ts       The source monitor wall (+ feed-shaders.ts: the WGSL shader feeds)
    ext-camera-monitor.ts  The EXT. CAMERA input card
    midi-panel.ts       MIDI profile / MPE / learn panel
    explain.ts          The console's Explain mode
    theme.ts            The console theme tokens and styles (docs/STYLEGUIDE.md)
site/                   The website (docs/WEBSITE.md): pages/ (one ESM entry per route), demos/,
                        DOM-free content (looks.ts, tour.ts, recipes.ts, look-link.ts), and the
                        committed captures (posters/ + posters.ts, assets/)
scripts/                site-data / build-site / check-site / smoke-site / capture-posters
test/
  unit/                 node:test suites (pure, headless)
  features/             cucumber World + step definitions
  golden/               golden-image/SSIM scaffolding (skips without a GPU)
  cucumber.mjs          cucumber-js configuration and the CI include-list
```

## Status (Phases 0–8 complete — project complete)

Implemented and rendering: **two buses** + Matte substitution, **Program Out** A/B/EFFECT,
**Mix/NAM** + the **compositional wipe engine**, the **Matte generator**, per-bus **Colour
Correction**, the four **filter effects**, the **freeze family** (Still/Strobe/Multi/Trail +
the ADR-0007 exclusion state machine), **Position control + Scene Grabber**, the two
**keyers** (Luminance + Chroma, as Mix/Wipe transition modes), and the **Downstream Key**
(WHITE/MATTE fill, EXT.CAMERA/A/B source, Low/High window, EDGE cycle, REVERSE). Rendering
covers all of the above plus Still/Strobe (freeze texture), Multi (grid tiling), the
Positioner PiP, the two keys (combine modes 2/3), and the DSK Normal fill.

**Audio (Phase 5):** the **audio mixer** (five faders on a real fader law, Mic/Aux2 switch,
Program-Out-aware routing with Master governance and Matte→silence), **Audio Follow** (an
equal-power A/B crossfade tied to the Mix/Wipe lever, Aux/Mic excluded), and **A/V Synchro**
(LEVEL-thresholded gating of the six eligible effects, Strobe held by the Effect Interval
Timer). The **Web Audio engine** (`src/audio/`) builds the real node graph and pushes gains
from the store; it is served but excluded from CI (no headless `AudioContext`), with
stand-in oscillator inputs.

**Fade + automation (Phase 6):** the **Fade stage** (the real last stage after DSK) with
independent VIDEO/DSK/AUDIO enables, MATTE/WHITE/BLACK/A/B targets, IN/OUT LEDs, and
fade-aware program audio (card→silence, bus→that bus + Aux/Mic); a **fade GPU pass** wired as
the renderer's final pass; and **Auto Take / Auto Fade** on one deterministic, pausable,
frame-counted **transition runner** (TRANSITION 0–510 in 2-frame steps, driven each present
frame by an `ADVANCE_TIMELINE` command against the canonical clock).

**Event Memory + Special Modes + persistence (Phase 7):** **Event Memory** — 8 in-store panel
snapshots, stored/recalled/sequenced (skipping empties) purely through the reducer, with AUTO
TAKE overloaded for recall; **Special Modes** — the 8-macro state machine (lever-at-B
preconditions, Vibrate's 64-frame run, Satellite orbit) with the compressed-image visuals
deferred; and a tiered **persistence** module behind an injectable `StorageBackend`
(schema-versioned, crash-proof, Reset ON/OFF boot, JSON import/export) that mirrors the bank and
field preset to storage.

**Control mapping + recipes + polish (Phase 8, final):** the **control-input mapping layer**
(`src/control/`, ADR-0014) — a remappable logical-control vocabulary fed by keyboard / gamepad /
MIDI / Web Serial GPI / a local automation API, with one pure resolver as the sole command
emitter and a per-tick coalescer, bindings persisted; the **combination recipes** and the
previously-deferred cross-feature `@integration` scenarios composed at the domain level; and the
**Frame** field/frame button as a provable v1 no-op. The project's domain model is now complete;
what remains deferred is pixel-rendering, browser-only surfaces, and faithfully model-constrained
scenarios (see the [ROADMAP](ROADMAP.md) Phase 8 note).

Deferred work is inventoried in **[DEFERRED.md](DEFERRED.md)** — the single consolidated list,
with a **buildable-vs-out-of-scope split and a file/line pointer for each item**. Since the
Phase-9 GPU sweep and the Phase-10 browser-I/O sweep, every picture pass and every browser-I/O
tier is written; what remains is a small set genuinely **not** buildable without breaking
fidelity (the model-constrained double-effect / Multi+Strobe scenarios) or **out of scope** (the
`@deferred` frame-field interlace scenarios, `@wip` Pattern-Table parts, analog/genlock timing).
**Golden-image pixel tests** are stubbed for the whole renderer because CI has no headless-WebGPU
adapter — an environment limit, not a code limit. (A local headless Chrome with
`--enable-unsafe-webgpu` does render; that is how the site's stills are captured.)

The domain is verified headlessly: the **`node:test` unit suite** and **563 Gherkin scenarios
(4137 steps)** across source, program-out, mix/nam, matte, wipe, colour-correction, the five
digital-effect features, position/scene-grabber, the three key features, the three audio
features (mixer, follow, A/V Synchro), fade control + Auto Take, Event Memory, Special Modes, the
control-input mapping layer, the combination recipes + cross-feature integration, and the
Frame-mode v1 no-op.
