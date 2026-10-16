# ADR-0017: Composable embedding — mixer host element and context protocol

- Status: Accepted
- Date: 2026-08-19
- Deciders: project owner

## Context and Problem Statement

The engine is already headless: `createEngine()` (src/app.ts) assembles the store, the
logical clock, and the source bindings with no DOM and no GPU (ADR-0004 boundary), and
the UI obeys a strict one-way contract — read snapshots, dispatch commands
(ADR-0011). But the *composition* of these parts is not reusable. `src/main.ts` is a
hand-written boot script wired against page-level element ids (`#program`,
`#mx-sources`, `#mx-console-mount`), and the operator console receives the store
through a factory call. The mixer can currently be used in exactly one way: the demo
page.

The owner wants the library usable in three shapes:

1. **The full mixer** — the operator surface as the demo shows it today.
2. **A single tag** — one element that plays a video through a given preset, with the
   embedding page controlling it from outside (`<mx-mixer src="…" preset="…">`).
3. **À-la-carte composition** — controls and monitors placed as children of the mixer,
   *or* living elsewhere in the page, *or* driven purely from JavaScript.

The question this ADR settles: **who owns the engine, the GPU, and the render loop;
how do control and display components discover them; and what is the public embedding
API** — without a framework (ADR-0003) and without weakening the one-way store
contract (ADR-0011) or the render loop's independence (ADR-0012).

## Decision Drivers

- Zero-config child composition must work in plain HTML: a control dropped inside the
  mixer element finds its mixer with no attributes and no script.
- Non-descendant and script-only composition must also work: a page may place controls
  far from the mixer, or drive it entirely from code (or from MIDI/serial/keyboard via
  ADR-0014, which already normalises onto store commands).
- Multiple mixer instances on one page must scope correctly (a docs page embedding
  several configured mixers).
- No framework and no new dependency (ADR-0003); the mechanism must be the platform's.
- The one-way contract survives: connected components get exactly the store (dispatch
  + subscribe + snapshot), a tick reader, and a frame hook — never the renderer, the
  GPU device, or a mutable back door.
- The headless engine stays constructible without any of this (ADR-0016: the Gherkin
  suite keeps building `createEngine()` directly).
- Embedding must not impose storage side effects: a page embedding a preview mixer
  must not silently write the operator's localStorage tiers (ADR-0015).

## Considered Options

### Option A — Module-level singleton (generalise main.ts)

Keep one shared engine in module scope; components import and use it.

- Good: no plumbing at all; smallest diff.
- Bad: exactly one mixer per page, hidden coupling through module state, untestable
  composition, and library consumers inherit our demo's wiring. **Rejected.**

### Option B — Factory injection everywhere (status quo, extended)

Every component takes the store through a constructor/factory argument, as
`createConsole(store, …)` does today.

- Good: explicit, type-safe, already proven.
- Bad: not declarative — HTML alone cannot compose anything, so use cases 2 and 3
  collapse back into "write a boot script". Every new component grows the same
  hand-wiring. **Rejected as the only mechanism** — but the explicit `bind()` path is
  kept as the imperative tier, so nothing existing breaks and tests keep injecting
  directly.

### Option C — Host element + context-request protocol (chosen)

A `<mx-mixer>` custom element owns engine + GPU + renderer + loop. Components resolve
a shared `MixerContext` through the [Context Community Protocol](https://github.com/webcomponents-cg/community-protocols/blob/main/proposals/context.md)
pattern: a composed, bubbling context-request event answered by the nearest host —
plus a `for="id"` attribute for non-descendants and plain property/`bind()` injection
for scripts.

- Good: all three usage shapes fall out of one mechanism; scoping across multiple
  instances is DOM ancestry, which is what authors already expect; the protocol is
  ~40 lines of vanilla TypeScript with no dependency; works through Shadow DOM
  (`composed: true`).
- Neutral: the host must queue context requests that arrive before its async GPU boot
  completes.
- Bad: one more indirection to understand than direct injection.

### Option D — Adopt a context library (e.g. `@lit/context`)

- Good: protocol compliance for free.
- Bad: a runtime dependency for ~40 lines of code; violates the spirit of ADR-0003.
  **Rejected.**

## Decision Outcome

Chosen option: **C — a `<mx-mixer>` host element providing a `MixerContext` through a
context-request protocol, with `for=` and imperative injection as explicit tiers.**

### The context

One narrow interface is the entire coupling surface between the host and every
connected component:

```ts
interface MixerContext {
  store: PanelStore;                 // dispatch + subscribe + getSnapshot (ADR-0011)
  tick(): number;                    // the logical clock (ADR-0012)
  presetIo: PresetFileIo | null;     // preset save/load glue (ADR-0015); null when the host has no storage
  onFrame(fn): Unsubscribe;          // display-cadence hook, called after each rendered frame
}
```

Deliberately absent: the renderer, the GPU device, the persistence backends. Display
components subscribe to the store or `onFrame`; control components dispatch commands.
The page-level embedder (a boot script like the demo's) may additionally use the host
*element's* richer properties (`engine`, `gpu`, `registry`, `renderer`,
`persistence`, `beforeFrame`) — that surface is for composition roots, not for
components, and the context never exposes it.

### The host: `<mx-mixer>`

Owns everything the demo's `boot()` owned: WebGPU capability detection and device
init, the engine, the `SourceRegistry` (slots default to the Matte source until an
embedder binds real feeds), the renderer, and the render loop. Renders its Program Out
canvas as its own content.

Attributes, all optional:

- `width` / `height` — internal canvas resolution (default 1280×720).
- `persist` — opt IN to the ADR-0015 storage tiers (localStorage scalars, IndexedDB
  stills, boot restore, preset file io). Absent means a fully ephemeral instance:
  embedding never writes the host page's storage by default.
- `src` — URL of a clip: bound to Source 1, assigned to bus A, Program Out `effect` —
  the single-tag playback case.
- `preset` — URL of an ADR-0015 preset file, fetched and routed through the **same
  import path as a file import** (`importPreset` over an in-memory backend, then the
  one LOAD path), so URL presets inherit the schema envelope, sanitising, and
  versioning for free.
- `controls` — like `<video controls>`: the host appends its own `<mx-console>`.

Events out: `mx-ready` (dispatched **synchronously before the first frame**, so a
listener may bind real sources into the registry with no wrong-source frame ever
presented — the registry-is-the-swap-point rule of ADR-0008 makes this race-free);
`mx-unavailable` (WebGPU missing; cancelable — `preventDefault()` suppresses the
host's inline fallback message when the page renders its own); `mx-preset-error`.

Frame hooks, in fixed order per logical frame: `beforeFrame(tick)` (input pumping —
the ADR-0014 coalescer flush and gamepad poll live here), then `ADVANCE_TIMELINE`,
then render, then `onFrame(snapshot, tick)` (display chrome: tallies, timecode). The
`avPulse` property is the seam for the A/V-Synchro envelope measurement (ADR-0010),
which stays page-owned because audio taps are.

### The three connection tiers

1. **Ancestry (zero config):** on connect, a component dispatches the composed,
   bubbling context-request event; the nearest `<mx-mixer>` ancestor answers (queueing
   the callback if its boot has not finished) and stops propagation, which is what
   scopes nested/multiple instances.
2. **Reference:** a `for="mixer-id"` attribute makes the component dispatch the same
   request directly on the referenced element — the `<label for>` idiom.
3. **Imperative:** the existing `bind(store, …)` / factory path, unchanged — this is
   also what tests use, and what framework wrappers should use.

A component implements all three with one helper call in `connectedCallback`; explicit
`bind()` always wins over a later-arriving context.

### Layering (extends ADR-0013)

ADR-0013's two layers become four, changing nothing below:

1. **Primitives** (`mx-fader`, `mx-tbar`, `mx-joystick`, …) — value in, event out; no
   store, no context. Unchanged.
2. **Blocks** (source select, mix/wipe, fade, …) — compose primitives, translate
   events to commands. Unchanged internally.
3. **Connected surfaces** (`mx-console` now; monitors and standalone blocks to
   follow) — resolve a `MixerContext` via the tiers above.
4. **The host** (`<mx-mixer>`) — owns engine/GPU/loop and provides the context.

### Consequences

**Good**

- All three usage shapes are served by one mechanism, and the simplest full mixer
  embed becomes `<mx-mixer controls persist></mx-mixer>`.
- The one-way contract is *narrowed*, not widened: components see less than
  `createConsole` passes today (no way to reach the renderer through the context).
- Multiple independent mixers per page work by construction (per-host engine, GPU
  device, and loop; ancestry-scoped discovery).
- The headless engine and the whole test strategy (ADR-0016) are untouched: nothing
  below `src/ui/` changes.
- Embedding is storage-safe by default (`persist` is opt-in), and URL presets reuse
  the tested import/sanitise path rather than growing a second loader.

**Bad**

- The host's async boot forces a request queue and a ready event — more lifecycle to
  document than a plain factory.
- Until the console is decomposed into standalone connected blocks, "à-la-carte
  controls" means the full console or custom composition against the context; the
  block split is roadmap work, not part of this ADR's first implementation.
- Per-instance GPU devices are the simple-and-correct choice for a handful of
  embeds, but a page with many mixers pays one device each; sharing devices across
  hosts is explicitly out of scope until a real use case demands it.

**Neutral**

- The demo page becomes the first consumer of the public API (it composes
  `<mx-mixer>` + `<mx-console for>` + its monitor wall), which keeps the embedding
  path honest but couples the demo to the same lifecycle rules as any embedder.
- The context protocol follows the community-protocol *shape* without claiming full
  interop compliance; if interop with other context consumers ever matters, the event
  can be renamed and widened without touching component code.

## Amendment — docs-page embedding (2026-10-16)

The project's own website became the "real use case" the Consequences above wait for: a
single docs page now carries up to eight small mixers, each with one block connected. Three
host attributes and two members were added for it. All are opt-in, so existing embeds behave
exactly as before.

- `feeds="pattern"` binds the four procedural pattern feeds (`src/ui/pattern-feeds.ts`,
  extracted from the monitor wall) to Sources 1–4. The host draws them on its logical clock,
  so they pause whenever the loop pauses.
- `run="visible"` defers boot until the host first intersects the viewport, then runs the
  loop only while it is on screen and the tab is visible. A host hidden with `display: none`
  never intersects, so it never boots.
- `shared-device` takes the GPUDevice from a page-wide shared acquisition
  (`sharedGpuDevice()` in `src/gpu/device.ts`) instead of acquiring one per host.
  `initGpu()` is now split into device acquisition and canvas configuration. A lost shared
  device is forgotten, and the next host acquires a fresh one. One device loss now takes
  every sharing host down together. That is acceptable for a docs page, and it is why
  sharing remains opt-in.
- `loadPreset(json)` and `exportPreset()` expose the preset path that the `preset`
  attribute already used, for share links and scripting. `loadPreset` goes through the
  same sanitising import and reports rejection with `mx-preset-error`.

The embedding surface is now documented as data next to the code
(`src/ui/mixer-api.ts`; block provenance in `src/ui/blocks/reference.ts`). A unit test
fails if the host reads an attribute, dispatches an event, or loses a member that the
tables don't match. The context itself is unchanged.

## More Information

- ADR-0003 (Vanilla TypeScript with banira and no UI framework) — why the mechanism
  must be platform-native.
- ADR-0008 (Uniform input-source abstraction) — the registry-as-swap-point rule that
  makes pre-first-frame source binding race-free.
- ADR-0011 (Single unidirectional panel state store) — the contract the context
  transports.
- ADR-0012 (Render loop and transition timing model) — the loop the host owns; hook
  ordering per logical frame.
- ADR-0013 (Hybrid panel-layout UI on Web Components) — the layering this extends.
- ADR-0014 (Control input mapping layer) — external control that composes with the
  host through `beforeFrame`.
- ADR-0015 (Persistence for Event Memory and settings) — the storage tiers behind
  `persist` and `preset`.
- [Context Community Protocol](https://github.com/webcomponents-cg/community-protocols/blob/main/proposals/context.md)
  — the discovery pattern tier 1 follows.
