# Development

How to run, test, and build web-mx-50. Phase 0 (skeleton) — see [ROADMAP.md](ROADMAP.md).

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
browser: you should see SMPTE-style colour bars with a moving sweep line (proof the
render loop and the source → signal-graph → present chain are live).

## Test

```bash
npm test           # typecheck + unit + features + golden (the full gate)

npm run typecheck    # tsc --noEmit
npm run test:unit    # node:test — pure engine/domain logic (clock, store, reducer, bindings, graph)
npm run test:features# cucumber-js — the ./features specs against the headless engine
npm run test:golden  # golden-image/SSIM scaffolding; SKIPS where no WebGPU adapter (ADR-0016)
```

The Gherkin layer (ADR-0016) executes the real `.feature` files in
[`../features`](../features). Phase 0 scopes the cucumber run to the first Rule of
`inputs-and-devices.feature` ("one input bound"); the remaining rules await later
phases (see `test/cucumber.mjs`). Unit tests run TypeScript directly via `tsx`.

## Build (no-bundler production output)

```bash
npm run build      # banira compile src/main.ts --output dist
```

Emits ES modules to `dist/` (banira follows the import graph from `main.ts`). There is
no bundler by design (ADR-0003); bare imports resolve via import maps. A
bundling/minification pass is a deferred, additive step.

## Project layout

```
src/
  constants.ts          Canonical timing + colour constants (ADR-0005, ADR-0012)
  core/
    types.ts            Domain vocabulary (bus, source, size)
    signal-graph.ts     Per-bus / combine / downstream stage chain (ADR-0004)
    resolve.ts          Bus resolver + Matte substitution + audio-follows (ADR-0006)
    transition.ts       Mix weights, composite rule, NAM bias (reference §9)
    program.ts          Program Out video + audio routing (reference §2)
    matte.ts            Matte palette, LEVEL/GRADATION semantics, GPU colour (reference §4)
    wipe.ts             Wipe families/variants, numbering oracle, legality, edges, direction (reference §9.4/§9.7)
    colour-correct.ts   Colour-correction tri-state, CHROMA/saturation, mono tint (reference §6)
    digital-effect.ts   Filters + freeze family: selection, exclusions, TIME intervals (reference §8)
    positioner.ts       Positioner availability + ASPECT-ON gating (reference §7)
    key.ts              Shared luminance/chroma keying: masks, opacity, tolerance (reference §9.5/§9.6)
    dsk.ts              Downstream Key: edge ring, window, fill/edge colour, key source (reference §10)
    audio.ts            Audio mixer: fader law, follow crossfade, program-mix gains, LED map (reference §5, §12)
    av-synchro.ts       A/V Synchro: LEVEL threshold, trigger/hold rules, pulse train (reference §8.9)
  state/
    state.ts            PanelState + FACTORY_PRESET + fieldPreset (ADR-0011, ref §18)
    commands.ts         Typed command union
    reducer.ts          Pure reducer
    store.ts            PanelStore: dispatch / getSnapshot / subscribe
  engine/
    clock.ts            Fixed-timestep logical clock, injectable (ADR-0012)
    loop.ts             rAF present loop + accumulator + clamp (ADR-0012)
    renderer.ts         Two-bus renderer: resolve → per-bus → combine → program-out → present
  sources/
    source.ts           Uniform Source interface (ADR-0008)
    generated-source.ts GPU test-pattern source, one per slot (distinct variant)
    matte-source.ts     GPU Matte generator source (colour / level / gradation)
    registry.ts         BusSource → Source map used by the renderer (ADR-0008)
    binding.ts          Source→provider binding registry (inputs-and-devices)
  gpu/
    capabilities.ts     WebGPU feature detection + graceful message (ADR-0002)
    device.ts           Device + sRGB swapchain (ADR-0002, ADR-0005)
    present.ts          Blit Program Out to the canvas' sRGB view
    combine.ts          Mix/NAM combine pass (reference §9.1-§9.3)
    wipe.ts             Compositional wipe pass (reference §9.4)
    bus-processor.ts    Per-bus colour correction + filter effects pass (reference §6, §8.1-§8.4)
    dsk.ts              Downstream Key pass — keyed title over the composite (reference §10)
    shaders/*.wgsl.ts   WGSL string modules (present/test-pattern/matte/combine/wipe/bus-effect/dsk)
  audio/
    engine.ts           Browser Web Audio graph, gains driven by the store (ADR-0010)
    av-synchro-tap.ts   Runtime envelope tap → A/V-Synchro effect gate (browser-only)
  ui/
    control-strip.ts    First Web Component control surface, store-bound (ADR-0013)
  app.ts                Headless engine assembly (store + clock + bindings)
  main.ts               Browser entry: capability guard → device → sources → renderer → loop
test/
  unit/                 node:test suites (pure, headless)
  features/             cucumber World + step definitions
  golden/               golden-image/SSIM scaffolding (skips without a GPU)
  cucumber.mjs          cucumber-js configuration
```

## Status (Phases 0–5 complete)

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

Next: fade + auto take/fade (Phase 6), event memory + special modes (Phase 7), control
mapping + polish (Phase 8).

Known deferrals: **golden-image pixel tests** (no headless-WebGPU runner here); **Trail's
ping-pong accumulator**, **Scene-Grabber freeze-in-place**, the **five non-Normal DSK edge
styles**, and the **EXT.CAMERA GPU binding** — all domain-complete, GPU held back as the
riskiest/blocked-on-device pieces; Compression/Slide/Blinds not yet in the wipe shader;
**A/V-Synchro per-frame GPU picture-gating** and **real audio-input capture** are browser-only
follow-ons (the tap surfaces the gated-effect set today); underivable Pattern-Table parts
`@wip`; **real browser-input binding** still open from Phase 1. See the [ROADMAP](ROADMAP.md).

The domain is verified headlessly: **134 `node:test` units** and **408 Gherkin scenarios
(2931 steps)** across source, program-out, mix/nam, matte, wipe, colour-correction, the five
digital-effect features, position/scene-grabber, the three key features, and the three audio
features (mixer, follow, A/V Synchro).
