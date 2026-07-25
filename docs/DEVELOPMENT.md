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
    signal-graph.ts     Ordered stage chain, pass-through in Phase 0 (ADR-0004)
  state/
    state.ts            PanelState + FACTORY_PRESET + fieldPreset (ADR-0011, ref §18)
    commands.ts         Typed command union
    reducer.ts          Pure reducer
    store.ts            PanelStore: dispatch / getSnapshot / subscribe
  engine/
    clock.ts            Fixed-timestep logical clock, injectable (ADR-0012)
    loop.ts             rAF present loop + accumulator + clamp (ADR-0012)
  sources/
    source.ts           Uniform Source interface (ADR-0008)
    generated-source.ts GPU test-pattern source (the one Phase 0 source kind)
    binding.ts          Source→provider binding registry (inputs-and-devices)
  gpu/
    capabilities.ts     WebGPU feature detection + graceful message (ADR-0002)
    device.ts           Device + sRGB swapchain (ADR-0002, ADR-0005)
    present.ts          Blit Program Out to the canvas' sRGB view
    shaders/*.wgsl.ts   WGSL as string modules (no bundler)
  app.ts                Headless engine assembly (store + clock + graph + bindings)
  main.ts               Browser entry: capability guard → device → loop
test/
  unit/                 node:test suites (pure, headless)
  features/             cucumber World + step definitions
  golden/               golden-image/SSIM scaffolding (skips without a GPU)
  cucumber.mjs          cucumber-js configuration
```

## Phase 0 status

Everything past the source stage is a **pass-through** (ADR-0004): the signal graph,
store, clock, loop, capability guard, and one generated source are wired end to end,
but colour correction, digital effects, mix/wipe, keys, DSK, fade, and audio are not
implemented yet. Those arrive in Phases 1–8 per the [ROADMAP](ROADMAP.md).
