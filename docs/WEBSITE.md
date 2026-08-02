# Website concept — web-mx-50

> **Status: built, and narrowed.** The site exists in [`site/`](../site/), builds with
> `npm run site:build`, and deploys to GitHub Pages from
> [`.github/workflows/pages.yml`](../.github/workflows/pages.yml).
>
> **Scope decision (superseding §3, §4.5 and §4.6):** the three meta routes — `/specs/`,
> `/decisions/` and `/status/` — were **removed by owner decision**. The site is now six routes
> focused on the machine itself, with two nav items. The material they carried has not been
> deleted from the project: it lives in [`features/`](../features/), [`adr/`](../adr/) and
> [`DEFERRED.md`](DEFERRED.md), and the site links out to each. The scenario counts on the
> Overview are still generated and still show the authored-vs-executed split — that honesty was in
> the numbers, not in the browser page. §4.5, §4.6 and the `/specs/` replay design (D13) are kept
> below as a record of the design, not as a description of what ships.
>
> It inherits the repo's hard constraints (ADR-0003 no framework/no bundler, ADR-0013 web
> components, [`STYLEGUIDE.md`](STYLEGUIDE.md)) and reuses `src/` directly — **the site never
> re-implements domain logic, it imports it.**
>
> **Counts in this document are measured, dated, and non-authoritative.** Every figure below was
> taken on **2026-08-02**; on the site itself none of them are hand-typed (§7.3). Where this doc
> writes a number, the site writes an interpolation from `stats.json`.

## 1. What the site is for

The repo is a *proof of concept with high behavioural fidelity*. The README already says that
well. What the README cannot do is **let you touch it**. The site exists to convert a claim
(*"a suite of executable specs derived from the manual pins the behaviour of a 1990s broadcast
mixer"*) into something a visitor verifies with a mouse in ninety seconds.

**One-line promise:** *A 1990s two-bus broadcast mixer, rebuilt block for block in the browser —
here is every block, running, next to the spec that pins it.*

### The measured baseline (2026-08-02)

| Figure | Value | How it was taken |
|---|---|---|
| Scenarios **authored** | **594** (4349 steps) | cucumber `--dry-run` over `features/` |
| Scenarios **executed in the gate** | **563** (4137 steps) | cucumber `--dry-run` with `test/cucumber.mjs` |
| Feature files | 26 | `ls features/*.feature` |
| ADRs | 16 | `adr/0001…0016` |

**The unit-test count is deliberately absent, here and everywhere else.** It moves with almost
every commit, it says nothing a reader can act on, and the repo has already carried three
different values for it across three documents. Repo prose says "the `node:test` unit suite is
green"; the site says the same. Scenario counts stay because they measure the *spec surface* —
what the machine is claimed to do — not the size of the test file.

The authored/executed split matters and the site must never blur it: [`test/cucumber.mjs`](../test/cucumber.mjs)
scopes the run with an explicit `name:` include-list, so 31 authored scenarios do not execute
(`@deferred`, `@wip`, and scenarios parked by design). The honest public phrasing is
*"N scenarios execute headlessly against the manual-derived spec; M more are authored and
deliberately deferred"* — never a single blended number.

> [`docs/ROADMAP.md`](ROADMAP.md) is the exception that keeps its numbers: its per-phase entries
> are a dated changelog of what was true at each milestone, so their counts are history, not
> claims about today. Never "refresh" them.

### Audiences, in priority order

| Audience | What they came for | What must be reachable in one click |
|---|---|---|
| **Engineers / reviewers** (hiring, peers, "how is this built?") | architecture, testing rigour, honesty about gaps | Architecture page, spec browser, ADR index, deferred list |
| **Video / broadcast people** who know the MX50 | "did they get the wipes right? the DSK? the pattern numbers?" | The Machine pages + wipe deep-dive, launch console |
| **Web-platform people** (WebGPU, vanilla, no-bundler) | proof the stack holds up at this size | Architecture's build story, the console itself |

All three are served by the same spine, so the site does not fork into three microsites.

### Non-goals

Not a product page, not a download, not a tutorial for the real hardware, not a Panasonic
fan-site. No fake company voice, no "get started free". It's a lab notebook you can operate.

## 2. Editorial thesis — the signal path *is* the site

The hardware has one fixed block order (ADR-0004), and so does the code:

```
Source → Colour Correction → Digital Effect → Mix/Wipe → Downstream Key → Fade → Program Out
```

That chain is the site's navigation, its table of contents, and its central diagram. Most
descriptions hang off a stage; most demos belong to a stage; most feature files and ADRs are
filed under a stage.

**The spine is necessary but not sufficient.** Four parts of the machine sit *off* the signal
path — the Audio Mixer (B-3) with Audio Follow and A/V Synchro, Event Memory (H-1), Special
Modes (H-2), and the input/control layer. They get a peer page (§4.8), not a footnote. A concept
that files everything under a video stage silently drops the "A" of "A/V mixer".

### What is generated and what is drawn

The diagram's **inner nodes and their order are generated** from [`src/core/signal-graph.ts`](../src/core/signal-graph.ts)
— `PER_BUS_STAGES`, `COMBINE_STAGE`, `DOWNSTREAM_STAGES`, composed as `STAGE_ORDER` — so the
processing order cannot drift from the code. `STAGE_ORDER` holds **five** stages; the `Source`
and `Program Out` endpoints are authored diagram furniture and *can* drift. Either accept that
(and label them as furniture) or export them as named constants from `signal-graph.ts` so
`spine.json` covers the whole chain. **Decide before building** — see §11 Q6.

### The repeated unit: the "block card"

Every stage page is built from one repeating pattern, four panes:

```
┌─ WHAT THE HARDWARE DOES ──────────┬─ THE DEMO ────────────────────────┐
│ 2–3 sentences, plain language,    │  live, operable, keyboard-usable  │
│ cited to the feature reference §  │  (the real code, not a mock)      │
├─ WHAT'S MODELLED ─────────────────┼─ THE SPEC THAT PINS IT ───────────┤
│ the store shape + the rules that  │  a real Gherkin scenario, with a  │
│ came out of the manual            │  ▶ Replay button. Source links.   │
└───────────────────────────────────┴───────────────────────────────────┘
```

That four-pane unit is the whole design system for content. Description and demo are never
separated **on any page that ships a demo** — and §10 states plainly which pages ship
description-only in which phase, rather than pretending the rule holds from day one.

## 3. Information architecture

**Two nav items** — The Machine · Architecture — plus a persistent **Launch console** button, top
right, the one call to action. Overview hangs off the wordmark; the wipe deep-dive and the
off-spine page nest under The Machine.

| Route | Nav | Page | Role |
|---|---|---|---|
| `/` | wordmark | **Overview** | Hero, the pitch, the generated signal spine, the numbers, three doors into the depth |
| `/machine/` | ✅ | **The Machine** | Every signal stage, anchored, each a stack of block cards. The bulk of the descriptions and demos |
| `/machine/wipes/` | sub | **The wipe engine** | The showpiece deep-dive: 7 families, compositional variants, RS-422 numbering, borders/soft edges |
| `/machine/audio-memory-control/` | sub | **Audio, Memory & Control** | The off-spine blocks (§4.8): the 7-input audio mixer, Event Memory, Special Modes, inputs & devices |
| `/architecture/` | ✅ | **How it's built** | One store, one graph, one clock, headless-first testing — each claim with a demo that proves it |
| `/console/` | button | **The console** | The real app in its own document, behind a runtime capability check, with the control map and a "try this" strip |

**On the removed meta routes.** `/specs/`, `/decisions/` and `/status/` were cut. The reasoning
that put them in the nav still stands as reasoning — an honest deferred inventory *is* a strong
signal — but a site can carry that signal by linking to the repository rather than by re-hosting
it, and three meta pages against four content pages was a poor ratio for a site whose subject is a
mixer. What replaced them:

- the Overview's numbers strip keeps the **authored vs executed** split and links to `features/`
  and `adr/` on GitHub;
- every block card names the scenario that pins it and links to its feature file;
- the footer carries "here is what isn't built" straight to `DEFERRED.md`;
- pages with no demo yet say so in the demo pane instead of deferring to a status page.

## 4. Page-by-page

### 4.1 Overview (`/`)

**Above the fold.** The Program Out canvas, wide, running the console in **attract mode**. A
single line of type over it:

> **web-mx-50** — the Panasonic WJ-MX50, rebuilt in the browser on WebGPU. Vanilla TypeScript,
> no framework, no bundler. Behaviour pinned by *{executed}* executable specs derived from the
> manual.

Two buttons: **Launch the console** · **Read how it's built**.

**Attract mode is new work, not existing capability.** [`AutomationApi`](../src/control/automation.ts)
today exposes exactly five operations — `triggerAutoTake`, `triggerAutoFade`, `runTransition`,
`selectWipePattern`, `stepEventMemory` — with no colour-correction or DSK ops, and
`createAutomation` is constructed **only in tests** ([`world.ts`](../test/features/support/world.ts),
`test/unit/control.test.ts`), never in `src/main.ts`. So a scripted hero loop requires three
pieces of build work, scheduled in §10:

1. Extend the automation surface with CC and DSK operations that dispatch the existing commands.
2. Construct the API in the console's boot path and expose it to the hosting page (query param
   or `postMessage` bridge into the iframe).
3. Give the hero instance an **ephemeral boot mode** — swap in `MemoryStorageBackend`
   ([`persistence/backend.ts`](../src/persistence/backend.ts)), skip `attachPersistence`, boot
   from the factory preset. Without this the hero shares `localStorage` with the visitor's own
   saved console state: the loop would start from whatever they left behind, and could overwrite
   it.

**The numbers strip.** Four figures interpolated from `stats.json` (§7.3), never hand-typed:
scenarios executed · steps executed · feature files · ADRs, with the authored/executed split
shown on hover. Each links to its evidence. No unit-test count, per §1 — the strip carries the
spec surface, not the size of the test file.

**The spine.** The signal chain as an interactive diagram (D18). Hovering a stage lights it; a
click scrolls to that stage on `/machine/`. Under the diagram, one sentence per stage, plus a
tab across to the off-spine blocks (§4.8). This is the site's map and the thing people will
screenshot.

**Three doors.** *For the video people* → The Machine. *For the engineers* → Specs. *For the
web-platform people* → Architecture's build story. One card each, matching §1's audience list
exactly.

**Honest footer.** "Proof of concept. Not affiliated with Panasonic. Here's what isn't built:"
→ `/status/`.

### 4.2 The Machine (`/machine/…`)

Seven stage pages, each a stack of block cards (§2). Descriptions are written from
[`docs/wj-mx50-feature-reference.md`](wj-mx50-feature-reference.md) with section citations, so
the prose has the same provenance as the specs.

| Stage page | Block cards | Lead demo |
|---|---|---|
| **Sources & Matte** | two-bus model, substitute-source blink rule, the 9-colour matte generator | D19 Bus board · D15 Matte palette |
| **Colour Correction** | per-bus CC, the RGB joystick, chroma-only mode, B&W | D7 CC bench (GPU) |
| **Digital Effect** | the four filters, the freeze family, the ADR-0007 exclusion machine | D6 Effects rack (GPU) · D6b Trail geometry (no GPU) |
| **Positioner & Scene Grabber** | the hardware's B-5 block: inset placement, lever-sized inset, freeze-in-place, PiP storability | D20 Positioner scope (no GPU) |
| **Mix / Wipe** | Mix, NAM, the wipe engine, Luminance & Chroma keys as transition modes | D4 Wipe wall (GPU) · D5 Transition rules |
| **Downstream Key** | fill vs key source, the level window, the **six-state EDGE ring** (Normal + five styles), reverse | D8 DSK bench (GPU) |
| **Fade** | independent Video/DSK/Audio enables, the **five targets** (Matte / White / Black / A / B) | D9 Fade bench (GPU) |
| **Program Out** | effected vs clean bus, preview is always effected, the timecode/tally language | D1 the console itself |

Positioner gets its own page rather than a mention under Digital Effect: the hardware numbers it
B-5, it has its own feature file, and [`core/positioner.ts`](../src/core/positioner.ts) is
substantial enough to demo on its own.

Each page ends with an **Automation & timing** call-out where the stage touches Auto Take,
linking to `/architecture/`; audio call-outs link to §4.8, which actually contains audio content.

### 4.3 The wipe engine (`/machine/wipes/`)

The deep-dive, because it's the most impressive single piece of domain work and the easiest to
demonstrate without WebGPU. Demo mechanics live in §5; this page supplies framing and order.

1. **The compositional claim** — 7 families × 4 variants × modifiers (Compression / Slide /
   Multi / Pairing / Blinds) × border & soft edge × direction, not a lookup table of sprites.
2. **D3 Geometry scope** — scrub the lever, watch the reveal rect and the sample transforms move.
   Runs on a phone.
3. **D4 Wipe wall** (GPU) — all 28 forward patterns live in a grid on real feeds; click one to
   send it to the big canvas.
4. **D2 The pattern dialer** — the numbering oracle, answering as the shipping code. Note the
   real shape of that space: 7 × 4 = **28 forward patterns (1–28)** plus their reversals
   (129–156). `numberToPattern` *throws* outside those ranges, so the dialer answers
   family/variant/reverse there, answers RS-422 addressability and the AG-A800 call across the
   full 1–255, and shows an explicit **"outside the modelled pattern space"** readout for the
   rest — which is itself an honest statement about the model.
5. **Edges & direction** — border colour from the matte palette, soft edges, the wide-edge blink
   rule, one-way vs symmetrical travel.

### 4.4 How it's built (`/architecture/`)

This page **renders or heavily sources [`docs/architecture.md`](architecture.md)** rather than
re-authoring it; the four claim/demo pairs below are layered on top, and the build story links
[`docs/DEVELOPMENT.md`](DEVELOPMENT.md) as its source.

| Claim | Demo that proves it |
|---|---|
| **One pure store** (ADR-0011) — the panel is a single JSON value, every change a typed command through one reducer | **D11 Store inspector**: operate a mini console, watch the JSON diff highlight, see the command name that caused it. Copy the state. Paste one back |
| **An explicit signal graph** (ADR-0004) — processing order is structural and cannot drift | **D18 Live spine**: inner nodes generated from `STAGE_ORDER` (§2); toggle a stage and watch it refuse to reorder |
| **A deterministic clock** (ADR-0012) — a 300-frame Auto Fade behaves identically at 60 and 144 Hz | **D10 Determinism bench**: two runners side by side at simulated 60 Hz and 144 Hz, frame counters and lever positions locked together, drift readout pinned at 0 |
| **Headless-first specs** (ADR-0016) — behaviour is verified against the manual, not a screenshot | **D13 Spec replayer**, and the `/specs/` page it links to |

The testing claim names **both** halves of ADR-0016: the headless Gherkin + `node:test` layer
that runs, *and* the golden-image/SSIM tier in [`test/golden/`](../test/golden/) that is wired
into the gate and skips honestly where no headless-WebGPU adapter exists. Naming the skip is
worth more than hiding it.

**The build story — no bundler.** Native ESM with **all-relative `.js` specifiers**: `src/` has
zero bare imports and [`index.html`](../index.html) contains no import map, so the whole app
loads from one `<script type="module">` with nothing to resolve. [banira](https://github.com/sebs/banira)
provides the dev server (transpiling TS on the fly, mapping `.js` → `.ts`) and the compile step.
Show the actual `index.html` and the `npm run build` output tree. The site is built the same way
— dogfood, stated plainly.

### 4.5 The specs (`/specs/`)

The page that makes the fidelity claim checkable.

- **Browse**: all 26 feature files, grouped using the existing taxonomy in
  [`features/README.md`](../features/README.md) — which already groups by signal flow *and* has
  slots for Audio, Memory & Modes, Inputs, and Integration — with stage as a facet filter rather
  than the sole taxonomy.
- **Filters**: `@deferred` / `@integration` / `@wip`, with per-tag counts **generated from
  `scenarios.json`**, not copied from the README's prose. (The README's legend currently claims
  no feature carries `@wip`; three scenarios do. Generating the counts makes that class of drift
  impossible on the site.)
- **Read**: the real Gherkin, syntax-highlighted, with a link to the step definitions that
  execute it and to the manual section it derives from. That second link needs a target:
  publish [`wj-mx50-feature-reference.md`](wj-mx50-feature-reference.md) as a site page (it is an
  original paraphrase, consistent with §8) and deep-link its numbered sections, or point at the
  GitHub blob. **Decide before building** — §11 Q7.
- **Executed vs authored**: scenarios outside the CI include-list are shown, clearly marked, with
  the reason. `scenarios.json` therefore parses *all* feature files, not just the CI run.
- **Replay** (D13): press ▶ and watch the steps drive the real domain code — see §5 Tier 3 for
  what that does and does not mean.
- **Search**: one box over all scenario text. "chroma", "blink", "510 frames".

This page is the strongest argument the project has. It should be one click from the hero.

### 4.6 Decisions (`/decisions/`) and Status (`/status/`)

`/decisions/` renders the 16 ADRs from [`adr/`](../adr/) with a "decided / superseded" state chip
and a filter by stage. Both the metadata and the stage mapping need a real source — see §7.3.

`/status/` renders [`docs/DEFERRED.md`](DEFERRED.md) in its actual shape, which is not a flat
four-bucket list:

- **Built** — three sections retiring former buckets (the GPU-rendering work of Phase 9, the
  browser-I/O work of Phase 10, and the domain-composable `@integration` set), each row pointing
  at where it landed.
- **Out-of-model** — would break a tested invariant.
- **Out-of-scope** — deliberately not built, per accepted ADRs (0005, 0015, 0016) or because the
  source data isn't derivable.
- **One environment limit** — golden-image pixel tests, blocked only by the absence of a
  headless-WebGPU adapter here, not by missing code.

The tone stays exactly as the doc has it: specific, with file/line pointers. No spin.

### 4.7 The console (`/console/`)

The real application, full-bleed, at the top of the viewport. Around it:

- **A capability banner stated as capability, not browser names** — `navigator.gpu` +
  `requestAdapter()` at runtime decides what the visitor sees. Hard-coded version lists rot;
  the one in [`Readme.md`](../Readme.md) already has.
- **The control map** from [`src/control/bindings.ts`](../src/control/bindings.ts), with **D16**
  live beside it: press a key, pad button, or MIDI note and watch it resolve to a logical control
  and then to a store command.
- **"Try this"** — five 15-second recipes, sourced from
  [`features/combination-recipes.feature`](../features/combination-recipes.feature), which is
  ready-made content: "drag the lever with NAM selected", "build a Mosaic Spotlight", "store a
  look to Event Memory 3, change everything, recall it".
- **"Use your own footage."** Each source monitor already has a file picker, a camera option, and
  a still-image option; media loaded this way is an object URL that never leaves the browser.
  This is a feature worth advertising, and it is the honest counterpart to §8's `videos/` rule.

### 4.8 Audio, Memory & Control (`/machine/audio-memory-control/`)

The off-spine peer page (§2). Same block-card unit, same provenance.

| Block cards | Lead demo |
|---|---|
| **Audio Mixer (B-3)** — 7 inputs, the fader law, master vs direct-out routing, 0 dB | **D14 Audio curves** |
| **Audio Follow (G)** — equal-power crossfade tied to the lever, with Aux 1 / Mic-Aux 2 excluded | D14 |
| **A/V Synchro** — audio-gated effects, threshold and hold, Strobe's Effect-Interval-Timer exception | D14 |
| **Event Memory (H-1)** — 8 slots, store / recall / sequence, the two-tier still storage and schema-versioned persistence | **D12 Event Memory** |
| **Special Modes (H-2)** — the 8-macro bank | **D17 Special modes** |
| **Inputs & devices** — source binding, camera/mic enumeration behind permission, device loss | **D21 Device catalog** |

This page also carries the browser half of ADR-0010: [`src/audio/engine.ts`](../src/audio/engine.ts)
taps the feed videos through Web Audio behind zeroed faders, and the mic is demand-driven with no
fake fallback.

## 5. Demo catalogue

**This section is the canonical demo registry.** §4 references demos by ID and supplies page
framing only; mechanics, imports and tiers live here, so there is one place to change.

Three tiers, distinguished by what they need from the browser — this is what makes the site work
without WebGPU.

### Tier 1 — GPU benches (WebGPU required)

The real renderer, one block exposed.

| # | Demo | Uses | Proves |
|---|---|---|---|
| D1 | **The console**, attract mode + free play | `src/main.ts` + the extended automation surface (§4.1) | The whole thing is real |
| D4 | **Wipe wall** — 28 forward patterns live, click to enlarge | `gpu/wipe.ts`, `gpu/shaders/wipe.wgsl.ts` | The compositional engine |
| D6 | **Effects rack** — 4 filters, freeze family, exclusion machine | `gpu/bus-processor.ts`, `gpu/trail.ts` | ADR-0007 in motion |
| D7 | **Colour correction bench** — joystick, chroma-only, B&W | `gpu/shaders/bus-effect.wgsl.ts`, `core/colour-correct.ts` | Per-bus CC |
| D8 | **DSK bench** — level window, the six-state EDGE ring, reverse | `gpu/dsk.ts`, `core/dsk.ts` | Downstream keying |
| D9 | **Fade bench** — selective Video/DSK/Audio to the five targets | `gpu/fade.ts`, `core/fade.ts` | The final stage |

**Budget rule — and the harness work it implies.** Target: one WebGPU device per page, shared;
only the demo in the viewport renders (`IntersectionObserver`); DPR capped at 1.5; everything
pauses on blur. None of that exists yet, and two pieces need small refactors in `src/`, budgeted
in §10 W3:

- [`gpu/device.ts`](../src/gpu/device.ts) exposes `initGpu(canvas)`, which acquires a fresh
  adapter **and** device per canvas. Device acquisition must be split from canvas configuration
  so benches can share one device.
- [`ui/demo-feeds.ts`](../src/ui/demo-feeds.ts) is the four-monitor wall UI: its draw patterns are
  module-private and each instance runs an always-on rAF loop. Export the pattern functions (or a
  `createPatternFeed()` factory) so a bench can build feed textures without the wall.
- Pausing needs an explicit hook — `RenderLoop.start()/stop()` ([`engine/loop.ts`](../src/engine/loop.ts))
  wired to visibility. For D1 the hook must live in the console's own boot path, because an
  isolated document cannot be paused from a `site/demos/` wrapper.

### Tier 2 — Domain demos (no GPU; the called domain code is DOM-free, the demo shell is plain DOM/canvas)

The site's insurance policy: they run everywhere, and they are the demos that best show the
*engineering*. All of them call the shipping functions directly.

| # | Demo | Calls | Renders as |
|---|---|---|---|
| D2 | **Wipe pattern dialer** — 1–28 / 129–156 ↔ family/variant/reverse; RS-422 addressability and AG-A800 across 1–255; explicit out-of-space readout | `core/wipe.ts` | Form + readout |
| D3 | **Wipe geometry scope** (reveal rect + affine remaps as you scrub) | `revealRect`, `revealAnchors`, `compressionAffine`, `slideAffine`, `blindsAxes` | Canvas2D |
| D5 | **Transition rules** (mix weights, NAM dominance, composite rule per type) | `core/transition.ts` | Plot + readout |
| D6b | **Trail geometry** (16 copies, decay, corner, spawn interval) | `trailCopyRect`, `trailVisibleCopies`, `trailCopyWeight` | Canvas2D |
| D10 | **Determinism bench** (60 Hz vs 144 Hz, drift = 0) | `core/timeline.ts`, `engine/clock.ts` | Dual readout |
| D11 | **Store inspector** (JSON diff per command) | `state/store.ts`, `state/reducer.ts` | Diff view |
| D12 | **Event Memory** (8 slots, store/recall/sequence, export/import a preset file) | `core/event-memory.ts`, `persistence/preset-file.ts` | Slot grid |
| D14 | **Audio curves** (fader law, equal-power Audio Follow, A/V Synchro gating) | `core/audio.ts`, `core/av-synchro.ts` | Plot (+ Web Audio on click) |
| D15 | **Matte palette** (9 colours, level, gradient) | `core/matte.ts` | Swatches + canvas |
| D16 | **Control mapping** (press a key / pad / MIDI note → logical control → command) | `control/resolver.ts`, `control/bindings.ts` | Live trace |
| D17 | **Special modes** (the 8-macro bank geometry) | `core/special-mode-geometry.ts` | Canvas2D |
| D18 | **Signal spine** (pipeline diagram; inner nodes generated, endpoints authored — §2) | `core/signal-graph.ts` | SVG |
| D19 | **Bus board** — two bus rows of five sources; the substitute-source blink rule when Matte can't stand in | `state/reducer.ts`, `core/resolve.ts` | Button grid |
| D20 | **Positioner scope** — inset placement and size, lever-sized inset, grab-and-move, PiP storability | `core/positioner.ts` | Canvas2D |
| D21 | **Device catalog** — permission-gated camera/mic enumeration, device loss, rebinding | `sources/device-catalog.ts`, `sources/binding.ts` | State table |

### Tier 3 — Spec replay (D13)

**What is honestly buildable.** A Cucumber formatter *cannot* see which commands a step
dispatched or which assertions it made — that data does not exist at the formatter layer, and
many steps assert on pure-function outputs and World scratch state that a reducer replay could
never re-check. So the mechanism is:

1. **Instrument the World** ([`test/features/support/world.ts`](../test/features/support/world.ts))
   to record, per step: the commands dispatched and a hash of the resulting store snapshot.
2. **Emit** that journal alongside the Gherkin text and each step's recorded result.
3. **In the browser, replay the command journal against the live reducer** and diff the snapshot
   hashes. A mismatch between recorded and replayed state is a real error the page can surface.
4. **Assertion-only steps** (those that check a pure function's return or World scratch) render
   their *recorded* pass/fail, clearly distinguished from re-executed steps.

So it is neither a video nor a mock — the state transitions really re-run — but the page must not
claim it re-checks every assertion client-side. Widening step 4 means rewriting assertion steps
to emit machine-checkable claims; that is a separate budget, not a footnote.

### Fallbacks, keyed on capability

Decided at runtime by `navigator.gpu` + `requestAdapter()`, never by browser name or device class
— WebGPU phones exist, and version lists rot.

| Capability | Gets |
|---|---|
| WebGPU available | Everything |
| No WebGPU | Tier 2 + Tier 3 in full, plus short **self-captured** loops in place of each Tier-1 bench, labelled *"recorded — WebGPU unavailable here"* with enable instructions |
| No pointer + keyboard | Everything except the console page, which shows its capture loop and says plainly that a console wants a pointer and a keyboard |
| `prefers-reduced-motion` | Attract mode does not autoplay; blinks pin solid (already the styleguide rule); demos start paused with a play control |

Never a spinner where a capability is missing, and never a silently degraded demo — the label
says which mode you're in.

## 6. Look and feel

The site is **not** a second design language. It reuses `src/ui/theme.ts` tokens wholesale, so
the console embedded in a page and the page around it are the same object.

- **Ground**: `--mx-bg-deep` page, `--mx-panel-hi/lo` cards, `--mx-line` hairlines, 8px radii.
  Depth from gradients and inset highlights only — no shadows-as-decoration, no texture.
- **Type**: the console's label language (8–9px, 500, uppercase, 0.08–0.2em tracking) for
  metadata, chips, and stage names. Prose gets a normal reading size (16–17px, ~68ch measure) —
  a console styleguide is for controls, not for paragraphs, and this is the one place the site
  extends the system rather than copying it.
- **Accent discipline**: `--mx-accent` stays **focus-only**, exactly as the styleguide demands —
  including on the Launch-console CTA, which takes the **amber "armed" LED treatment** rather
  than an accent outline. The LED palette carries state on the site too: amber for
  "selected/armed", red for on-air, green for "spec passing". A green scenario chip and a green
  Audio-Follow LED meaning the same thing ("ready/verified") is a nice accident of the existing
  palette; keep it.
- **Imagery**: none. No stock photos, no 3D renders of the hardware, no manual scans. The only
  pictures on the site are the ones the renderer makes. Inline SVG and authored CSS only, per
  ADR-0003 (also keeps the site offline-capable and CDN-free).
- **Social card**: a **committed** Program Out capture (see §7.5) — not a build product, because
  the build has no headless-WebGPU adapter.

## 7. Build & deploy

### 7.1 Shape

```
site/
  main.ts             # site shell + route mounting
  pages/*.ts          # one module per route, content as authored TS templates or MD
  demos/*.ts          # <mx-demo-*> web components — thin wrappers over src/
  content/*.md        # prose for the description panes
  assets/             # committed captures: social card, per-bench fallback loops (§7.5)
  generated/          # stats.json, scenarios.json, spine.json, adr.json  (CI-produced, gitignored)
```

Demos live in `site/demos/` and **import from `../src/`** — no copies, no forks. If a demo can't
be built by importing the real module, that's a finding about the module, not a reason to mock.

### 7.2 Toolchain

`banira compile site/main.ts --output _site`, plus a copy step for the page shell, `assets/`, and
the generated JSON. Compiled output keeps the source tree shape (`_site/site/…` alongside
`_site/src/…`), and the shell's single `<script type="module">` points at `site/main.js`. No
bundler, matching ADR-0003. Two things to watch:

- **banira's compile lib floor is pre-ES2016** — the same rule that applies to `src/` applies to
  `site/`: `indexOf(...) !== -1` rather than `Array.prototype.includes`, even though `tsc`
  accepts the latter.
- **No import map is needed and none should be introduced.** Every specifier stays relative, as
  in `src/` today. If a layout change ever forces a bare specifier, that is a decision to make
  deliberately, not a build detail to absorb.

**Couple the site to the gate.** [`tsconfig.json`](../tsconfig.json) includes only `src` and
`test`, and [`package.json`](../package.json)'s gate is typecheck + unit + features + golden — so
today a `src/` refactor could pass `npm test`, deploy, and break every demo that imports `../src`.
The day `site/` lands, its typecheck (and ideally its compile) joins that chain.

### 7.3 Generated content — nothing on the site is hand-typed

A CI step runs the existing gate and emits into `site/generated/`:

| File | From | Feeds |
|---|---|---|
| `stats.json` | `npm test` reporters + a full-corpus cucumber dry-run | The numbers strip — **both** authored and executed counts (§1) |
| `scenarios.json` | a Cucumber formatter + a parse of **all** feature files | `/specs/` browse, tag counts, search, and D13 replay traces |
| `spine.json` | `core/signal-graph.ts` | The spine diagram's inner nodes (§2) |
| `adr.json` | each ADR's H1 + its `Status:` / `Date:` / `Deciders:` bullet block (the ADR-0001 convention — the files have **no** YAML front matter) | `/decisions/` index |

The ADR **stage mapping** has no source in the repo today. Either add a `Stages:` bullet to each
ADR's metadata block (cheapest, keeps the convention) or check in a mapping file — but do not
hand-type it into the site, which would breach this section's own rule. §11 Q8.

**The deploy is gated on the test run.** If the suite is red, the site does not publish — the
site's central claim is that the suite is green, so it must not be able to lie.

### 7.4 Hosting

GitHub Pages from `sebs/webgpu-mx-50` (the repo behind the `web-mx-50` package name), built by an
Action on push to `main`. Static, no server, no analytics beyond (optionally) a
privacy-preserving counter. Custom domain optional.

### 7.5 Captured assets

The social card and the Tier-1 fallback loops are **maintainer-recorded, committed, versioned
assets** in `site/assets/` — not build products. The build environment has no headless-WebGPU
adapter (the same limit that parks the golden-image tests, per `DEFERRED.md`), so nothing in CI
can render a frame. Record them from the real console via the scripted automation sequence with
`MediaRecorder`, and re-record when renderer or WGSL output changes. If a headless-WebGPU runner
is ever added to the Action, this section and the golden tests unlock together.

## 8. Asset & legal hygiene

Small section, real consequences.

- **Do not publish `videos/`.** Those are third-party YouTube downloads (~3 GB, already
  gitignored). The site's moving pictures come exclusively from the **procedural demo feeds** in
  `src/ui/demo-feeds.ts` and from self-captured Program Out loops. Visitors can still supply
  their own footage through the console's per-source file picker (§4.7); it stays local to their
  browser.
- **`Console UI mockups.zip`** is a tracked design source, not site content. Ship its *tokens*
  (already in `theme.ts`), not the export.
- **Panasonic**: name the hardware factually as the subject of the recreation, state
  non-affiliation in the footer and once in the Overview, use no Panasonic marks, logos, product
  photography, or manual scans. `docs/wj-mx50-feature-reference.md` is an **original paraphrase**
  organised by section number, not a reproduction — that is what makes it publishable under §4.5
  if we choose to publish it.
- **Licence**: **AGPL-3.0-only** ([`LICENSE`](../LICENSE)). The choice matters for a site like this
  one: §13 requires that users interacting with a modified version *over a network* be offered its
  source. Publishing the console at `/console/` is exactly that kind of network interaction, so the
  footer carries the licence and a link to the repository on every page — that link is the
  compliance mechanism, not decoration, and it must not be dropped in a redesign.

## 9. Accessibility, performance, quality bar

- Every demo control is the existing `src/ui/primitives/` layer — pointer-captured drag, arrow
  stepping, `Home`/`End`, ARIA slider semantics, visible focus ring — so the site inherits
  keyboard operability rather than re-earning it.
- Colour: the LED palette on `--mx-well` grounds clears AA for text; state is never carried by
  colour alone (LED + label + chip text).
- `prefers-reduced-motion` honoured per §5; blinks are already `step-end` by styleguide rule.
- **Budget, covering the real first view**: the Overview shell is **under 150 KB** of JS, and the
  hero paints a committed capture poster (§7.5) — the live console is fetched only after idle or
  first interaction, and is separately budgeted. A budget that excludes the thing dominating the
  viewport cannot fail, and therefore isn't a budget. Tier-1 benches load on demand; the whole
  site is ESM modules per route, so there is no bundle to blow up.
- The console loads in an isolated document (`/console/`, or an iframe on `/`), so a GPU device
  loss never takes the page with it.

## 10. Phasing

Every catalogued demo appears exactly once below.

| Phase | Scope | Status |
|---|---|---|
| **W0** | Shell, theme reuse, routing, deploy pipeline, `stats.json`; Overview with spine (**D18**) + numbers + footer | ✅ **Built.** Six routes, each a real directory with its own ESM entry — deep links work on Pages with no 404 rewrite |
| **W1** | The stage pages + `/machine/audio-memory-control/` with Tier-2 demos: **D2, D3, D5, D6b, D12, D14, D15, D16, D17, D19, D20, D21** | ✅ **Built** (plus **D10, D11** pulled forward onto `/architecture/`). CC / DSK / Fade / Program Out ship **description-only**, as planned |
| **W2** | `/specs/` + `scenarios.json` + **D13** replay | ⛔ **Cut.** The page was built, then removed with `/decisions/` and `/status/` by owner decision (see the status note at the top). D13 was never built |
| **W3** | Tier-1 benches **D4, D6, D7, D8, D9**, the device/feed/pause refactors (§5), capability fallbacks, committed captures (§7.5) | ⬜ **Outstanding.** The renderer already draws all of it; what is missing is the site-side harness |
| **W4** | `/console/` + attract mode (**D1**) incl. the automation extension and ephemeral boot (§4.1); `/architecture/` demos **D10, D11** | 🟡 **Partly built.** `/console/` runs the real app in its own document behind a runtime capability check, and D10/D11 shipped in W1. **Attract mode is not built** — the three pieces it needs are listed in §4.1 |

Demo accounting after the cut: **D13 is the only catalogued demo with no home**, since it existed
only to serve `/specs/`. D1, D4, D6, D7, D8 and D9 remain outstanding as W3/W4 work. Every other
demo in §5 ships.

### What was learned building it

- The §7.2 output-layout prediction held exactly: `banira compile` on `site/pages/*.ts` plus
  `src/main.ts` emits `_site/site/…` alongside `_site/src/…` with relative specifiers intact, and
  **no import map is needed anywhere**.
- Two verification scripts turned out to matter more than expected and are now in the deploy
  pipeline: [`scripts/check-site.ts`](../scripts/check-site.ts) walks every module specifier and
  fetched asset the way a browser would (a no-bundler site's most likely failure is a specifier
  that typechecks but points at a file the build never emitted), and
  [`scripts/smoke-site.mjs`](../scripts/smoke-site.mjs) loads all nine routes in headless Chrome and
  fails on any console error, dead request, or demo element that does not render.
- `tsconfig.json` now includes `site` and `scripts`, so `npm test`'s typecheck covers them — the
  src↔site coupling §11 Q9 asks about is closed for compile-time breakage.
- The counts in `stats.json` are computed by parsing the feature files directly, and they had to be
  taught two things to agree with cucumber: Background steps count once per scenario, and the
  `name:` include-list entries are **regular expressions**, not exact strings. They now reproduce a
  dry run exactly (563/4137 executed, 594/4349 authored).

W0–W2 is a genuinely good site on its own and needs zero WebGPU work. Note the reason is *not*
that rendering is unfinished: per `DEFERRED.md`, the GPU passes are built. W3 is **wiring and
harness work**, not renderer work — which is why it can follow the descriptive site rather than
block it.

## 11. Open questions

1. **Scope of the first cut** — is W0–W2 (descriptions, the stage-page no-GPU demos, spec
   browser) the right ship, with GPU benches following, or should the hero console land first?
2. **Spec replay depth** — the instrumented-World replay of §5 Tier 3 (proposed), or the cheaper
   option: render recorded traces only, with no live re-execution?
3. **Prose voice** — the repo's docs are dense and technical. Keep exactly that on the site, or
   soften the Overview for the video-people audience and stay dense underneath (proposed)?
4. ~~**Licence** (§8) — needed before publishing.~~ **Decided: AGPL-3.0-only.** Remaining detail: the
   SPDX id is pinned to `-only` rather than `-or-later`; flip it if future versions should apply
   automatically. Per-file SPDX headers are not present — the `LICENSE` file plus the
   `package.json` field is the whole declaration today.
5. **Domain** — `sebs.github.io/webgpu-mx-50/` or a custom domain?
6. **Spine endpoints** (§2) — accept `Source` / `Program Out` as authored furniture, or export
   them from `signal-graph.ts` so the whole diagram is generated?
7. **The manual reference** (§4.5) — publish `wj-mx50-feature-reference.md` as a site page and
   deep-link its sections, or link out to the GitHub blob?
8. **ADR stage mapping** (§7.3) — a `Stages:` bullet in each ADR, or a checked-in mapping file?
9. **src ↔ site coupling** (§7.2) — does the site build run on every `src/` push, and does the
   site track `main` or pin to tagged releases?
