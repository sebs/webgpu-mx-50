# ADR-0003: Vanilla TypeScript with banira and no UI framework

- Status: Accepted
- Date: 2026-07-24
- Deciders: project owner

## Context and Problem Statement

web-mx-50 recreates the Panasonic WJ-MX50 two-bus A/V mixer as a browser
application. Its core is a real-time render loop: every animation frame it
samples the current panel state (bus assignment, Mix/Wipe lever position,
active Digital Effect, DSK, Fade) and drives a WebGPU pipeline that composites
the two buses into Program Out. That loop must run at a stable display refresh
rate regardless of what the operator is doing on the panel.

Wrapped around that loop is a substantial control surface: source buttons,
faders, the Mix/Wipe lever, the RGB joystick, LED-style effect buttons, Event
Memory slots, and Special Mode presets. These need to be clean, responsive,
accessible, and remappable (ADR-0013 (Hybrid panel-layout UI on Web
Components), ADR-0014 (Control input mapping layer)) rather than a photoreal
skeuomorphic panel.

The question is which frontend stack and, specifically, which UI framework (if
any) hosts this, and which build/dev toolchain drives it. The decision is
architecturally load-bearing because a reactive UI framework's update model can
silently entangle itself with the render loop's frame budget, and because the
toolchain shapes how the Web Components are authored, typed, and tested.

## Decision Drivers

- The real-time render loop must not be coupled to UI reactivity. Compositing
  cadence is owned by `requestAnimationFrame` and the timing model
  (ADR-0012 (Render loop and transition timing model)), not by a framework's
  reconciler or scheduler.
- Panel state is a single unidirectional store (ADR-0011 (Single
  unidirectional panel state store)); the render loop reads it directly each
  frame. We do not want a second, framework-owned copy of that state to keep in
  sync.
- Small footprint and low overhead. This is a focused single-purpose app, not a
  content site; every dependency is a maintenance and supply-chain cost. The app
  leans almost entirely on platform APIs (WebGPU, Web Audio, Web MIDI, Custom
  Elements), so its runtime third-party surface is near zero.
- Direct control over the DOM, the `<canvas>`, and the GPU device without an
  abstraction layer mediating access to them.
- Long-lived, low-churn codebase. The WJ-MX50 feature set is fixed hardware; it
  will not chase framework churn.
- The UI is still a real product surface: it must be componentised, accessible,
  and testable without hand-rolling a framework of our own.
- The build/dev toolchain should reinforce the no-framework, native-Web-Components
  choice rather than pull the project toward a bundler-and-plugins model. A
  toolchain purpose-built for vanilla Web Components — one that scaffolds,
  compiles, generates a manifest and types, lints, and smoke-tests components —
  does more of the ergonomic scaffolding work than a generic bundler while adding
  no runtime.

## Considered Options

### Option A — Vanilla TypeScript, no UI framework, UI via native Web Components (chosen)

Plain TypeScript modules and the platform's Custom Elements / Shadow DOM for the
panel controls; no reactive UI framework.

- Good: zero reactive layer between store and render loop; the loop reads the
  store and paints, full stop.
- Good: smallest runtime footprint; no framework runtime shipped.
- Good: direct, unmediated access to `<canvas>`, WebGPU device, and DOM events.
- Good: Web Components are a browser standard, so controls are portable and
  framework-agnostic.
- Bad: we build the ergonomic scaffolding (base component class, attribute
  reflection, event conventions) ourselves — mitigated by the toolchain choice
  below.
- Bad: no large ecosystem of ready-made widgets; but the WJ-MX50 controls are
  bespoke anyway.

### Option B — React (or Preact)

- Good: mature ecosystem, familiar component model, rich tooling.
- Bad: the reconciler and its scheduler compete with the render loop for the
  main thread and the frame budget; a fader drag re-rendering a subtree can
  cost frames.
- Bad: pushes toward holding panel state in framework state (hooks/context),
  duplicating the single store (ADR-0011) or forcing awkward bridging.
- Bad: adds a runtime and a build-time dependency surface for UI we will
  hand-design regardless.

### Option C — Svelte (or a compiled reactive framework)

- Good: compiles away much of the runtime; smaller than React; ergonomic
  reactivity.
- Good: less per-frame overhead than a virtual-DOM diff.
- Bad: still introduces a reactivity model and a compiler step whose update
  timing we do not own, adjacent to a loop where we must own timing.
- Bad: couples the project to framework-specific file formats and tooling for a
  UI that is a thin skin over an explicit store.

### Option D — Lit (Web Components with a reactive base library)

- Good: standards-based Custom Elements, small runtime, good ergonomics for
  reactive rendering.
- Neutral: a middle path; adds a small dependency but stays close to the
  platform.
- Bad: still layers a reactive update cycle we would need to keep away from the
  render loop; the ergonomic win over hand-rolled base classes is modest for
  our bespoke, low-count control set.

### Toolchain within Option A — banira vs. Vite vs. raw tsc

Given "no framework, native Web Components", the toolchain is a second, separable
choice:

- **banira (chosen)** — the project owner's own toolchain
  (`github.com/sebs/banira`), purpose-built for vanilla Web Component
  development. Not a bundler or framework: it compiles TypeScript to ES modules
  via `tsc`, serves with live reload and on-the-fly TS, and additionally
  scaffolds components and generates a Custom Elements Manifest, `.d.ts`, editor
  data, lint, and smoke tests. Good: it does the exact scaffolding this app needs
  and nothing it does not; no runtime; owner-maintained. Neutral: no bundling —
  bare imports resolve through an import map to esm.sh. Bad: no plugin ecosystem
  for asset transforms (handled explicitly below).
- **Vite** — generic dev server + Rollup bundler with a rich plugin ecosystem.
  Good: fast HMR, mature, plugins for WGSL/asset imports. Bad: a bundler and
  plugin model we do not need for a near-zero runtime-dependency app; pulls
  toward a build shape heavier than the platform-first design warrants, and
  provides none of the Web-Component-specific manifest/lint/scaffold tooling.
- **Raw `tsc` + a static file server** — minimal. Good: fewest moving parts.
  Bad: we then hand-build the dev-reload loop, scaffolding, manifest, and typing
  that banira already provides.

## Decision Outcome

Chosen option: **Option A — Vanilla TypeScript with no UI framework, UI built
from native Web Components, driven by the banira toolchain.**

This keeps the render loop sovereign over timing and the store sovereign over
state. The UI is a set of Custom Elements that read from and dispatch intents to
the single store (ADR-0011); they never mediate the compositing path. TypeScript
gives type-safe contracts across the store, the signal-graph pipeline
(ADR-0004 (Explicit signal-graph pipeline mirroring the hardware flow)), the
WGSL binding layer (ADR-0002 (WebGPU as the rendering and compute backend)),
and the control-mapping layer (ADR-0014).

**banira as the build and dev workflow.** banira is neither a bundler nor a
framework. `banira compile` runs `tsc` to emit ES modules with source maps
(compiling the whole TypeScript project — engine, audio, store, and components,
not only Custom Elements). `banira dev` runs a combined watch + serve loop
(equivalently `banira serve --ts --hmr`) that transpiles TypeScript on the fly,
live-reloads, and hot-swaps custom elements in place. `banira init <tag-name>`
scaffolds a Custom Element (Shadow DOM, observed attributes, events, JSDoc) plus
a demo page. Bare imports resolve through a generated `<script type="importmap">`
pinned to esm.sh rather than being bundled; because the app depends almost
entirely on platform APIs, its runtime bare-import surface is near zero, so the
no-bundler model costs us little. banira also emits a Custom Elements Manifest,
`.d.ts` with `HTMLElementTagNameMap` augmentation, editor IntelliSense data, and
runs component lint (its Gold Standard checklist) and smoke/attribute-reflection
tests — tooling that directly backs the Web Components workflow (ADR-0013) and
the test strategy (ADR-0016). (Its optional MCP server for AI-assisted component
work is available but not load-bearing for the build.)

**Shaders and assets without a bundler.** With no bundler there is no `?raw`
import-plugin step, so WGSL is authored as `.wgsl` files fetched at runtime
(dev-served by banira) or generated into `.ts` string modules that the compiler
emits; static assets are served from the project root. This keeps shader source
first-class and diffable and avoids a plugin dependency (ADR-0002).

**Production.** The shippable artifact is compiled ES modules plus the generated
import map. An explicit bundling/minification pass is deliberately **deferred**
until a measured need — it is an additive build step, not an architectural
change, so adopting one later (or pinning esm.sh deps to a self-hosted copy)
does not disturb this decision.

How the UI is built instead of with a framework:

- Each panel control is a Custom Element (e.g. a source selector, a fader, the
  Mix/Wipe lever, the RGB joystick), encapsulated with Shadow DOM where style
  isolation helps and light DOM where accessibility semantics need to stay
  visible; scaffolded via `banira init` and audited via `banira lint`.
- Components are stateless with respect to domain state: they render from the
  store's current snapshot and emit typed intents (CustomEvents or direct store
  dispatches). The store is the single source of truth; the render loop and the
  UI are two independent readers of it (ADR-0011, ADR-0012).
- A thin shared base class provides attribute/property reflection and event
  conventions so components stay consistent without a framework runtime. Detail
  of the component architecture lives in ADR-0013.
- Control input mapping (keyboard, pointer, MIDI/gamepad remap) is a separate
  layer (ADR-0014) that also targets the store, so physical-control behaviour is
  decoupled from any specific DOM widget.

### Consequences

Good:

- The render loop's frame budget is protected: no reconciler, scheduler, or
  reactive flush shares the main-thread critical path with compositing.
- Minimal bundle and dependency surface; faster cold loads and a smaller
  audit/supply-chain footprint. The runtime third-party surface is near zero.
- Direct access to `<canvas>`, the GPU device, and DOM events with no
  abstraction to fight.
- Web Components are standard and durable; the UI will not need a framework
  migration as ecosystems churn.
- One state model (ADR-0011) instead of an app store plus a framework store to
  reconcile.
- banira's scaffolding, Custom Elements Manifest, `.d.ts` generation, lint, and
  smoke tests supply much of the ergonomic scaffolding this ADR would otherwise
  flag as self-authored work — while still shipping no framework runtime.

Bad:

- We still own the component conventions (base class, binding, event patterns);
  banira scaffolds and audits them but does not impose a framework's structure.
- Smaller hiring/onboarding familiarity surface than React; contributors must
  learn the in-house component conventions and the banira toolchain.
- No off-the-shelf widget ecosystem; every control is bespoke (acceptable, as
  WJ-MX50 controls have no generic equivalents).

Neutral:

- Testing splits by concern (ADR-0016 (Testing strategy: Gherkin domain specs
  plus golden-image shader tests)): component behaviour is exercised via the DOM
  and Custom Elements APIs (with `banira test`/`lint` for registration and
  reflection smoke checks), domain behaviour via Gherkin specs against the store,
  and rendering via golden-image shader tests. No framework test-renderer is
  involved, and no Vite/Vitest runtime.
- No bundler: bare imports resolve via an import map to esm.sh; WGSL and assets
  are files (fetched or emitted as string modules), not plugin imports. The
  near-zero runtime dependency surface makes this low-risk; production remains
  compiled ESM + import map, with bundling an optional deferred additive step.
- TypeScript strictness and module boundaries do the structural work a framework
  might otherwise impose.

## More Information

- Toolchain: banira — `github.com/sebs/banira` (compile / dev / init / manifest /
  types / lint / test for vanilla Web Components; no bundler, import-map based).
- Related: ADR-0002 (WebGPU as the rendering and compute backend),
  ADR-0004 (Explicit signal-graph pipeline mirroring the hardware flow),
  ADR-0011 (Single unidirectional panel state store),
  ADR-0012 (Render loop and transition timing model),
  ADR-0013 (Hybrid panel-layout UI on Web Components),
  ADR-0014 (Control input mapping layer),
  ADR-0016 (Testing strategy: Gherkin domain specs plus golden-image shader
  tests).
- This is a meta/stack decision with no WJ-MX50 feature-reference section; it
  constrains how every feature's UI is implemented rather than emulating any
  specific hardware behaviour.
