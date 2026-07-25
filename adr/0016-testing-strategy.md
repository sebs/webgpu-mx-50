# ADR-0016: Testing strategy: Gherkin domain specs plus golden-image shader tests

- Status: Accepted
- Date: 2026-07-24
- Deciders: project owner

## Context and Problem Statement

web-mx-50 has two kinds of behavior that fail in two very different ways, and a single test technique cannot cover both.

The first kind is **domain logic**: the rules that decide *what should happen* independent of any pixel. Which source a bus shows after a Matte substitution (ADR-0006 (Two-bus source model and Matte substitution rules)); which wipe number a given base pattern + modifier stack maps to and whether that combination is legal (reference 9.4, 9.7); what a fade to A/B versus MATTE does to program audio (reference 11); how a transition lever position drives the Auto Take timeline (ADR-0012 (Render loop and transition timing model)). These are pure, deterministic functions over the panel state store (ADR-0011 (Single unidirectional panel state store)). They are cheap to run, must be correct to the reference, and are the part a contributor is most likely to break silently.

The second kind is **shader output**: the actual pixels a WebGPU pass produces — a chroma key's alpha edge, a wipe pattern's boundary shape, a mosaic tile grid, a matte colour. Here "correct" is a picture, not a value, and the failure mode is a subtle visual regression (a haloed edge, an off-by-one tile) that no assertion on scalar state can catch.

We must decide the test stack for both, how the `./features` Gherkin files relate to executable tests, and how any of this runs in CI given that GPU access is not guaranteed on hosted runners. The reference's numbering oracle (section 9.7) — patterns 001–255 addressable, `+128` = the same pattern reversed, Special Modes and key functions mapped to pseudo-pattern numbers, `○`/blank legality — is a concrete, high-value target that pins the approach.

## Decision Drivers

- **The features are the living specification.** Every `./features/*.feature` file is already written in the project's ubiquitous language; the test strategy should *execute* those specs, not paraphrase them in a second dialect.
- **Two failure modes, two oracles.** Scalar-comparable domain rules want exact assertions; pixel output wants image comparison with a perceptual tolerance.
- **Determinism.** A test suite that flakes gets ignored. Domain tests must be pure; image tests need fixed inputs, fixed seeds, and a stable renderer.
- **CI reality.** Hosted CI runners frequently lack a usable GPU. The fast, high-coverage layer must run everywhere; the GPU layer must degrade gracefully, not block the pipeline.
- **Ground truth in the reference.** Golden images and expected numbers derive from the reference and the accepted ADRs, not from whatever the code currently emits (that would test nothing).
- **Low ceremony.** Vanilla TS + banira (ADR-0003 (Vanilla TypeScript with banira and no UI framework)); the test tooling should match — no framework runtime, headless where possible.

## Considered Options

### Option A — One end-to-end layer: drive the real UI in a browser and screenshot everything

Playwright against the running app; assert on rendered canvases and DOM.

- Good: Highest realism; exercises UI, store, and GPU together.
- Bad: Slow, flaky, and couples every domain-rule check to a full browser + real GPU + UI render.
- Bad: A wrong wipe number and a mis-styled button both surface as "a screenshot changed"; poor failure localization.
- Bad: The `./features` specs would become click-scripts, contradicting their declarative, UI-agnostic intent.

### Option B — Two-layer split: Gherkin domain specs on a headless engine + golden-image shader tests (chosen)

Cucumber-js executes the `./features` files against the **headless domain/engine layer** (store + pure logic, no DOM, no GPU). A separate golden-image / SSIM suite renders individual shader passes through a headless WebGPU runner and compares to committed reference PNGs. Plain unit tests cover the pure numbering oracle and pattern legality.

- Good: Each failure mode gets the right oracle; failures localize cleanly (a rule broke *vs.* a pass regressed).
- Good: The living-spec `.feature` files are the actual behavioral test source — no duplication.
- Good: The fast layer (Gherkin + unit) runs anywhere; the GPU layer is isolated and independently gate-able.
- Neutral: Two runners to configure (cucumber-js + an image-test harness).
- Bad: Requires disciplined seams — the engine must be constructible and steppable without a browser or GPU.

### Option C — Domain specs only; skip pixel testing, review shaders by eye

- Good: Simplest; no headless-GPU problem at all.
- Bad: Leaves the entire shader surface — keys, wipes, mattes, effects — with no regression net, exactly where subtle visual breakage hides.

## Decision Outcome

Chosen option: **Option B — a two-layer strategy.** Gherkin domain specs run by **cucumber-js** against the headless engine; **golden-image + SSIM** tests run individual shader passes through a **headless WebGPU runner**; **unit tests** pin the pure numbering oracle and pattern-legality functions. The `./features` directory is the living specification and the source of the behavioral layer.

Concrete rules:

1. **`./features/*.feature` are executed, not decorative.** Cucumber-js loads them directly; step definitions live in the test tree and drive the engine's public API (dispatch panel actions to the store, read derived state). Steps are **declarative and UI-free** — they assert domain outcomes ("the B-bus program source is the Matte", "program audio is silenced"), never DOM clicks. This honours the Gherkin conventions already in use and keeps the specs valid against the engine regardless of UI (ADR-0013).

2. **Tags gate execution.** `@deferred` scenarios (e.g. `frame-field-mode.feature`) are **not run** in v1 — registered, pending, excluded from the green bar. `@integration` recipes (`combination-recipes.feature`) run in a suite that may compose multiple subsystems and are allowed to be slower. `@wip` is excluded from the default run and from CI gating.

3. **The engine is headless and pure.** The behavioral layer touches only the state store and pure logic (ADR-0004 (Explicit signal-graph pipeline mirroring the hardware flow), ADR-0011). No `document`, no `GPUDevice`. This is a hard testability constraint on the engine's design, not merely a test convenience.

4. **The wipe numbering oracle is unit-tested exhaustively (reference 9.7).** A pure function maps `(base pattern, variant, modifier stack, direction)` ↔ **displayed number 001–255**, with the invariant that a **reversed** pattern is its forward number **`+128`** (001 ↔ 129, and back). Tests assert:
   - the forward↔reverse `+128` bijection over the whole legal set (and that reversing twice is identity);
   - the **pseudo-pattern mappings**: Special Modes 1–5 = 055–059 (reverses 184–186), NAM = 060, LUM KEY = 061, CHROMA KEY = 062;
   - **addressability bounds** — RS422 reaches 001–255; the AG-A800 edit-controller path reaches only 01–99, with "99" resolving to *the pattern currently set up on the mixer* (the reference's escape hatch), not a fixed pattern.
   These are table-driven tests whose expected values come from the reference Pattern Table, never from current output.

5. **Pattern legality is unit-tested (reference 9.4, 9.7).** A pure predicate decides whether a modifier stack (COMPRESSION / SLIDE / MULTI / PAIRING / BLINDS over the 7 base families) is legal, and what the auto-resolution is when it is not — **the modifier drops (its LED goes out) or the unit falls back to the Straight Wipe**. Tests cover representative legal combinations, the `○` panel-only-but-not-externally-callable cases, and invalid (blank-cell) combinations resolving to the documented fallback. This backs ADR-0009 (Compositional wipe-pattern engine).

6. **Golden-image tests cover shader passes (ADR-0002 (WebGPU as the rendering and compute backend)).** Each isolated pass — matte fill, colour correction, a wipe boundary at a fixed lever position, luminance key, chroma key, DSK edge styles, mosaic/nega/mono/paint, strobe/still/multi/trail — renders **fixed synthetic inputs** to an offscreen target and is compared against a committed reference PNG using **SSIM** (structural similarity) above a per-test threshold, with a bounded per-pixel delta as a secondary gate. SSIM (not exact-equality) absorbs benign driver rounding while still catching structural regressions (haloes, shifted edges, wrong tile counts).

7. **Determinism is engineered in.** Golden tests use **fixed input frames** (checked-in PNGs or procedurally generated from a seed), **fixed uniforms** (explicit lever/slider/time values — no wall clock), and **fixed effect seeds** (mosaic-random, strobe phase). The render loop is driven by an **injectable clock** (ADR-0012) so a transition can be stepped to an exact frame. Linear-working-space / sRGB-output conventions (ADR-0005 (Clean-modern RGBA video representation; defer analog emulation)) are asserted by including a known colour ramp whose encoded output values are predictable.

8. **Headless WebGPU runner (Dawn-based).** Golden tests run against a headless WebGPU implementation — **Dawn via a node binding (e.g. `node-webgpu`) or Deno's built-in WebGPU** — selecting a software/`cpu` adapter fallback where no hardware adapter exists, so results are stable across machines. Reference images are **regenerated only deliberately** via an explicit `--update-goldens` action gated behind human review of the diff; a normal test run never overwrites goldens.

9. **CI runs the layers on different gates.** The **Gherkin + unit layer is the required gate** and runs on every push on stock runners (no GPU needed). The **golden-image layer runs where a WebGPU adapter — hardware or software — is available**; where the CI image has none, it is reported **skipped, not failed**, and is additionally exercised on a GPU-capable runner (or locally pre-merge) so shader regressions are still caught before release. Golden runs pin the adapter/backend in the report so a driver-driven diff is distinguishable from a real regression.

### Consequences

**Good:**
- The `./features` living specification is the actual behavioral test corpus — one artifact, no drift between "the spec" and "the tests".
- Failures localize by kind: a red Gherkin scenario means a broken rule; a red golden means a changed pixel; a red unit test means a bad number.
- The fast layer gives near-universal, deterministic coverage of the parts most likely to silently regress (numbering, substitution, fade rules) and gates every commit.
- Isolating GPU tests keeps CI green on GPU-less runners without abandoning pixel coverage.
- Forcing a headless, pure engine improves the architecture, not just the tests.

**Bad:**
- Two runners and two failure vocabularies to learn and maintain.
- Golden images are maintenance-bearing: legitimate visual changes require a reviewed re-baseline, and SSIM thresholds need tuning to avoid false greens/reds.
- Full pixel coverage may not run on every push if the default CI image lacks an adapter, leaving a window between commit and the GPU-gated run.

**Neutral:**
- SSIM tolerance is a deliberate knob: too loose hides regressions, too tight flakes on driver differences; it is set per-test.
- `@deferred`/`@wip` scenarios accrue as executable-but-pending specs, a ready backlog for post-v1 work.
- The choice of node-webgpu vs. Deno for the headless runner is an implementation detail behind the golden harness and can change without touching the specs.

## More Information

- Verifies the behavior of essentially every other ADR; principal ties: ADR-0004 (Explicit signal-graph pipeline mirroring the hardware flow), ADR-0005 (Clean-modern RGBA video representation; defer analog emulation), ADR-0006 (Two-bus source model and Matte substitution rules), ADR-0009 (Compositional wipe-pattern engine), ADR-0011 (Single unidirectional panel state store), ADR-0012 (Render loop and transition timing model).
- Depends on the testability seams in ADR-0002 (WebGPU as the rendering and compute backend) (headless device) and ADR-0003 (Vanilla TypeScript with banira and no UI framework) (no framework runtime to mock).
- Living specification: the entire `./features` directory. Numbering-oracle and legality targets: `wipe-patterns.feature`, `wipe-edge-and-direction.feature`, `special-modes.feature`, `transition-mix-nam.feature`, `luminance-key.feature`, `chroma-key.feature`. Deferred/pending: `frame-field-mode.feature` (@deferred). Integration recipes: `combination-recipes.feature` (@integration).
- Reference sections: 9.4 (Wipe pattern system), 9.7 (Pattern Table & external control — the numbering oracle: 001–255, `+128` reversed, pseudo-pattern mappings, RS422/AG-A800 addressability, `○`/blank legality), 10 (DSK edge/reverse behavior), 11 (Fade rules).
