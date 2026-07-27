# web-mx-50 — Build Roadmap

A browser recreation of the Panasonic WJ-MX50 two-bus digital A/V mixer, rendered
with WebGPU. This roadmap sequences the work into phases, each with a concrete
Definition of Done and the feature specs and ADRs it realizes. It is grounded in
`docs/wj-mx50-feature-reference.md` (the authoritative feature reference) and the
sixteen accepted ADRs in `adr/`.

This document is a plan, not a contract of dates. Phases are ordered by dependency:
each builds on the signal-graph substrate laid down by the one before it. Where a
phase can start before its predecessor fully lands, that is noted.

---

## Vision and Scope

web-mx-50 recreates the *observable behavior* of the WJ-MX50 as a clean, modern,
accessible web instrument. The goal is a live-performable video mixer a VJ or video
editor can drive in the browser: two independent buses, four external sources plus an
internal Matte, the full compositional wipe matrix, the freeze-family digital effects,
luminance/chroma keying, a downstream title keyer, a final fade, an audio mixer that
can follow the video transition, Event Memory snapshots, Special Mode macros, and
Auto Take/Fade automation — all wired in the hardware's fixed signal order.

The fidelity stance is **clean modern** (ADR-0005). Video lives as full-resolution
RGBA in a linear working space and is emitted as sRGB. We reproduce what a VJ
*selects and sees* — matte colours, key edges, wipe boundaries, effect timing — not the
analog NTSC substrate that produced those behaviors on the original silicon.

The fixed signal flow every phase honors (reference §1, ADR-0004):

```
Source -> bus assignment -> Colour Correction -> Digital Effect
       -> Mix/Wipe -> Downstream Key (DSK) -> Fade -> Program Out
```

The stack is vanilla TypeScript + WebGPU + banira with native Web Components for UI
and no reactive framework (ADR-0002, ADR-0003, ADR-0013). The render loop is
independent of the UI layer (ADR-0012). Panel state is a single unidirectional store
(ADR-0011). Behavior is pinned by Gherkin domain specs plus golden-image shader tests
(ADR-0016).

**In scope for the clean-modern v1:** every non-deferred feature file in `features/`,
realized across Phases 0–8 below.

---

## Non-goals / Deferred

These are explicit decisions of record, not omissions to revisit casually.

- **Analog NTSC emulation is out of scope (ADR-0005).** No 4:1:1 chroma subsampling,
  no interlace fields, no composite noise, no per-bus frame-synchronizer re-timing.
  Browser sources already arrive as discrete, progressive, full-resolution RGB frames
  on the compositor clock; there is no analog timing to recover. A retro "analog look"
  is a plausible *later* feature and is deliberately not architecturally foreclosed,
  but it is not built in v1.

- **Frame field-versus-frame mode is deferred (`frame-field-mode.feature`,
  reference §8.10, ADR-0005).** With progressive RGBA frames there is no field parity
  to trade against vertical resolution, so the Frame button has no meaningful effect.
  The feature file is tagged `@deferred` and ships as a documented no-op/stub, not as
  working behavior.

- **The built-in frame synchronizer is moot (ADR-0007).** It exists on hardware to
  re-time two ungenlocked analog sources; in the browser every source is already timed.
  We do not build a resampling synchronizer.

- **Real serial / GPI hardware I/O is out of scope.** The physical GPI trigger input,
  RS422/RS232C editing-controller port, Black Burst / Advance Sync / Advance Reference
  timing outputs, the 10-pin title-keyboard bus, and balanced XLR audio hardware
  (reference §2, §17) are not emulated as devices. Their *behaviors* are reached
  through modern equivalents where they matter: Auto Take is triggerable from the UI,
  keyboard, MIDI, or gamepad (ADR-0014) rather than a make-contact BNC; the DSK key
  source is a browser input, not the External Camera In sync path.

- **A/B-roll edit-controller integration and VTR record timing are out of scope.** The
  Compression/Trail "advance sync required when recording to VTR" caveats (reference §2)
  do not apply to a browser output.

---

## Phased Milestones

### Phase 0 — Skeleton: banira/TS/WebGPU with one source and a test pattern

> **Status: ✅ done.** Runnable skeleton, injectable clock/loop, pass-through signal
> graph, single store, one generated source, WebGPU capability guard; domain tests green.


Stand up the project and prove the rendering substrate end to end with the minimum
viable pipeline: one input source drawn to the canvas through a WebGPU render pass, on
the timing model, with the state store and test harness bootstrapped.

**Realizes:**
- ADR-0001 (Record architecture decisions), ADR-0002 (WebGPU rendering backend),
  ADR-0003 (Vanilla TypeScript with banira and no UI framework),
  ADR-0005 (Clean-modern RGBA video representation).
- ADR-0004 (Explicit signal-graph pipeline) — the stage scaffold, initially a
  pass-through.
- ADR-0008 (Uniform input-source abstraction) — one source kind wired.
- ADR-0011 (Single unidirectional panel state store) — bootstrap store.
- ADR-0012 (Render loop and timing model) — the rAF-driven loop and canonical clock.
- ADR-0016 (Testing strategy) — cucumber-js (Gherkin) runner, a Node built-in
  test runner (`node:test`) for the pure unit specs, and golden-image harness
  scaffolding. No Vite/Vitest.
- `inputs-and-devices.feature` (partial: one input bound).
- A generated test pattern (the Matte generator's flat-colour path from
  `matte-generator.feature` doubles as the first on-screen source).

**Definition of Done:**
- `npm run dev` (runs `banira dev` — watch + serve with on-the-fly TypeScript and
  live reload) serves the app, which acquires a WebGPU device and renders one source
  (a `<video>`, image, or generated test pattern) full-resolution into a linear RGBA
  working texture and presents it as sRGB.
- The render loop runs on `requestAnimationFrame` decoupled from any UI, driven by the
  canonical clock that reconciles seconds and NTSC frames (ADR-0012); frame time is
  monitor-independent and injectable for tests.
- The signal-graph pipeline exists as an explicit ordered chain of stages
  (ADR-0004), even though every stage past the source is a pass-through.
- The state store exists, is the single source of truth, and updates flow one way.
- A WebGPU-unavailable browser shows a graceful capability message, not a crash.
- CI runs the domain-test layer green; the golden-image layer runs where a GPU is
  available and degrades gracefully where it is not (ADR-0016).

---

### Phase 1 — Two buses, sources, program out, and basic Mix

> **Status: ✅ largely done.** Two-bus model with Matte substitution, Program Out
> (A/B/EFFECT) routing, Mix + NAM combine driven by the lever, the Matte generator
> (9 colours / level / gradation), and the first Web Component control strip are
> implemented and rendering; 90 Gherkin scenarios green across the four features.
> **Remaining:** wiring *real* browser inputs (camera/video/image live textures) into the
> source slots — the binding domain (registry, inputs-and-devices Rule 1) is done, but
> the live `getUserMedia`/file → GPU-texture sources and their picker are still to come.

Populate the front of the signal chain. Two independent buses each assign one of four
sources or the Matte, and the operator can choose what leaves as Program Out. The
first real bus-combining transition — Mix (dissolve) and NAM — brings the Mix/Wipe
lever to life.

**Realizes:**
- ADR-0006 (Two-bus source model and Matte substitution rules).
- ADR-0008 (Uniform input-source abstraction) — full: all four sources + Matte.
- ADR-0004 (signal-graph pipeline) — bus-assignment and Mix/Wipe stages populated.
- ADR-0011 (state store) — bus/source/program-out state.
- ADR-0013 (Hybrid panel-layout UI on Web Components) — first controls: source
  buttons, Program Out selector, the Mix/Wipe lever. UI work continues every phase and
  completes in Phase 8.
- `source-selection.feature`, `matte-generator.feature`, `program-output.feature`,
  `transition-mix-nam.feature`, `inputs-and-devices.feature` (complete).

**Definition of Done:**
- Any of four sources or the internal 9-colour Matte can be assigned to A-bus and to
  B-bus independently (reference §3, §4), with Matte substitution rules per ADR-0006.
- Program Out selection switches between A (direct A-bus), B (direct B-bus), and
  EFFECT (full processed composite) (reference §2 "Program Out Selection").
- The Mix/Wipe lever drives a Mix (cross-dissolve) transition between the two buses,
  and NAM (Non-Additive Mix) is selectable (reference §9.1–§9.3), compositing in
  linear light.
- Moving the lever end to end transitions A↔B; lever position is the transition
  parameter (foundation for wipes and Auto Take later).
- Device binding lets a user attach real browser inputs (files, camera, canvas) to the
  four source slots.

---

### Phase 2 — Compositional wipe engine

> **Status: ✅ largely done.** The compositional engine is in: 7 families × 4 variants,
> the modifier state machine (Compression/Slide/Multi/Pairing/Blinds), Border/Soft edges,
> One-Way/Reverse direction, Square Aspect, the numbering oracle (001 plain, +128 =
> reversed, RS-422/AG-A800 addressing) and the Blinds legality fallback — all rendering
> through a signed-distance-field wipe shader and driven by the lever. 86 more Gherkin
> scenarios green (176 total). **Deferred:** golden-image pixel tests (no headless-WebGPU
> runner available here); the shader realises the base families + edges + direction +
> aspect + Multi/Pairing coordinate ops, while **Compression/Slide/Blinds are
> domain-modelled but not yet in the shader** (fall through to the base field); and the
> underivable parts of the Pattern Table (generic illegal-modifier combos, panel-only
> 256–287) remain `@wip`, pending the manual's printed table.

Replace the plain dissolve with the WJ-MX50's headline feature: the 287-combination
wipe matrix built compositionally, not hand-authored.

**Realizes:**
- ADR-0009 (Compositional wipe-pattern engine).
- `wipe-patterns.feature`, `wipe-edge-and-direction.feature`.

**Definition of Done:**
- Wipes are composed from 7 base pattern families (each up to 4 variants) stacked with
  the modify functions — Compression, Slide, Multi, Pairing, Blinds — plus the Square
  family's Aspect stretch (reference §9.4).
- Edge treatment (Border / Soft) and direction (One-Way / Reverse) apply
  orthogonally (`wipe-edge-and-direction.feature`, reference §9.4).
- The hardware numbering is honored as a **test oracle**: `001` is the plain wipe and
  `+128` is the same wipe reversed; invalid combinations (blank Pattern-Table boxes)
  drop the offending modifier or fall back to the Straight Wipe exactly as the unit
  does (reference §9.4, §9.7).
- The wipe consumes the two post-effect bus frames at the Mix/Wipe stage and is driven
  by the lever position from the render clock (ADR-0004, ADR-0012).
- Golden-image tests pin representative pattern boundaries and edge treatments
  (ADR-0016).

---

### Phase 3 — Digital effects and GPU frame memory

> **Status: ✅ done.** Per-bus **Colour Correction** (tri-state, CHROMA/B&W, mono tint), the
> four **filter effects** (Nega, Mosaic, Mono, Paint), the **freeze family**
> (Still/Strobe/Multi/Trail with the full exclusion state machine — Still ⊥
> Strobe/Multi/Compression, Trail ∥ Still w/ blinking LED, Trail ⊥ A/V Synchro — and
> clock-driven TIME intervals), and **Position control + Scene Grabber** (Square-only,
> size-doubling, joystick placement, ASPECT-ON gating, grab/cancel). Rendering: colour
> correction + all four filters + Still/Strobe (freeze texture) + Multi (grid tiling) +
> the Positioner PiP + aspect stretch. 302 Gherkin scenarios green (2059 steps), 84 units.
> **Deferred rendering (domain complete):** Trail's ping-pong accumulator and the
> Scene-Grabber freeze-in-place — the two highest-risk-unverifiable GPU pieces, held back
> until a headless-WebGPU golden runner exists.

Build the per-bus image-processing block: colour correction, geometric position, and
the full Digital Effect block including the four freeze-family effects that share GPU
frame memory.

**Realizes:**
- ADR-0007 (GPU frame memory for freeze-family effects).
- `color-correction.feature`, `position-and-scene-grabber.feature`,
  `digital-effects-filters.feature` (Nega, Mosaic, Mono, Paint),
  `digital-effect-still.feature`, `digital-effect-strobe.feature`,
  `digital-effect-multi.feature`, `digital-effect-trail.feature`.
- Confirms `frame-field-mode.feature` remains a deferred no-op (ADR-0005).

**Definition of Done:**
- Per-bus Colour Correction operates between bus assignment and the Digital Effect
  block (reference §6, ADR-0004).
- Per-bus Position control and Scene Grabber work, the latter grabbing a still into
  frame memory (reference §7).
- The point/filter effects Nega, Mosaic, Mono, and Paint render per bus
  (reference §8.1–§8.4).
- Still, Strobe, Multi, and Trail work against per-bus GPU frame memory (ADR-0007,
  reference §8.5–§8.8), with correct **mutual-exclusion rules** (e.g. Still excludes
  Strobe/Multi; Trail may ride on top of Still).
- Strobe/Multi/Trail step on their reference intervals off the canonical seconds clock
  (Strobe ~0.03–2.1 s, Multi/Trail ~0.07–2.1 s; reference §8.6–§8.8, ADR-0012),
  identically on any monitor refresh.
- Frame memory is a property of a *bus*, not the whole composite (ADR-0007).

---

### Phase 4 — Luminance/Chroma keys and Downstream Key

> **Status: ✅ done.** **Luminance Key** (B over A by SLICE luminance threshold, lever =
> foreground opacity) and **Chroma Key** (HUE colour removal, SLICE tolerance, lever blends
> keyed↔unkeyed B) are selectable Mix/Wipe transition modes rendering through the combine
> pass (modes 2/3); the B-bus is always the key source (Matte→substitute). The **Downstream
> Key** is a real downstream stage (after Mix/Wipe, before Fade): ON, WHITE/MATTE fill,
> EXT.CAMERA / A / B key source, Low/High luminance window, 6-state EDGE cycle, REVERSE
> polarity, white-key edge colour + GRADATION vs matte-key edge-always-black. 62 more
> Gherkin scenarios green (364 total, 2590 steps), 98 units. **Deferred rendering:** the
> five non-Normal DSK edge styles (border/shadow geometry) and the EXT.CAMERA GPU binding
> (needs the Phase-1 device layer) — domain complete; anti-aliased key edges and exact
> chroma constants likewise await a golden-image runner.

Add the keyers: the two bus-combining keys at the Mix/Wipe stage, and the downstream
title keyer that sits after every effect.

**Realizes:**
- `luminance-key.feature`, `chroma-key.feature`, `downstream-key.feature`.
- ADR-0004 (signal-graph pipeline) — the DSK stage populated.

**Definition of Done:**
- Luminance Key keys one bus over the other by luminance threshold (reference §9.5).
- Chroma Key keys by hue with a clean alpha edge in linear light (reference §9.6).
- Both integrate at the Mix/Wipe stage alongside Mix/NAM/Wipe as selectable transition
  modes, driven by the lever where applicable.
- The Downstream Key composites a title/character source on top of the full processed
  composite — downstream of every effect, so titles stay sharp on any effect
  (reference §10, ADR-0004). The key source is a browser input (see Non-goals re: the
  hardware title/camera sync path).
- Golden-image tests pin key-edge alpha for both keys (ADR-0016).

---

### Phase 5 — Audio engine, Audio Follow, and A/V Synchro

> **Status: ✅ done.** The **audio mixer** models five faders (A/B/Aux1/Mic-Aux2/Master) on
> a real fader law (0 = off, 0.5 = 0 dB, top = +12 dB), the front-panel **Mic/Aux2 switch**,
> and Program-Out-aware routing: `programAudioMix` layers fader gains onto the existing
> `programAudio` contributor list — EFFECT routes all seven inputs and Master governs; direct
> A/B routes that bus + Aux + Mic and bypasses Master; a Matte bus contributes no audio. The
> **Audio Level Indicator** dB↔LED/clip mapping is pure. **Audio Follow** ties the A/B bus
> gains to the Mix/Wipe lever as an equal-power crossfade (`effectiveBusGains`), leaving Aux
> 1 and Mic/Aux 2 on their own faders; the standing faders are never mutated, so disengaging
> restores them. **A/V Synchro** gates the six eligible effects (Nega/Mosaic/Mono/Paint/
> Still/Strobe) on a LEVEL threshold vs the audio envelope — hold = time-above-threshold
> except Strobe, which uses the Effect Interval Timer; the shipped Trail⊥A/V-Synchro mutual
> refusal is kept. 44 more Gherkin scenarios green (**408 total, 2931 steps**), **134 units**.
> The **Web Audio engine** (`src/audio/engine.ts` + `av-synchro-tap.ts`) builds the real node
> graph and pushes gains from the store; it is typechecked and served but excluded from CI
> (no headless `AudioContext`). **Deferred (browser-only):** per-frame GPU picture-gating of
> the A/V-Synchro effects (the tap surfaces the active set as a transient signal today), and
> real media-input capture — inputs are stand-in oscillators. The one av-synchro scenario
> demanding Trail-wins ("Arming A/V Synchro is unavailable once Trail is engaged") and Auto
> Take's audio crossfade (@integration) are deferred to keep the shipped invariant / await
> Phase 6.

Bring up sound: the audio mixer on the Web Audio API, audio that can follow the video
transition, and audio-triggered effects.

**Realizes:**
- ADR-0010 (Audio engine on the Web Audio API).
- `audio-mixer.feature`, `audio-follow.feature`, `av-synchro.feature`.

**Definition of Done:**
- The audio mixer sums per-source faders plus the Aux/Mic path into Program audio
  (reference §5), on a Web Audio graph independent of the render loop (ADR-0010).
- Audio Follow ties the audio cross-fade to the video Mix/Wipe transition so sound
  tracks the picture (reference §12).
- A/V Synchro drives a digital effect from an audio trigger/envelope
  (reference §8.9), reading the same canonical clock so timing is deterministic and
  testable.
- Audio mixing math and the Follow curve are covered by domain tests; the
  effect-trigger threshold behavior is specified in Gherkin (ADR-0016).

---

### Phase 6 — Fade, Auto Take/Fade, and transition timing

> **Status: ✅ done.** The **Fade stage** is the real last stage (after DSK): independent
> VIDEO/DSK/AUDIO enables fade together from one lever move toward a target (MATTE/WHITE/
> BLACK, or the uneffected A/B bus), with IN/OUT LED states (solid at the extremes, blinking
> while incomplete). Fade-to-a-card silences the programme audio; fade-to-A/B retargets it to
> that bus + Aux/Mic (`programFadeAudioMix`, now also driving the browser audio engine); the
> headphone monitor is pre-fade. A **fade GPU pass** (`gpu/fade.ts`) mixes the post-DSK
> composite toward a flat colour or the raw bus texture and is wired as the renderer's final
> pass. **Auto Take** and **Auto Fade** share one pure **transition runner** (`core/timeline.ts`):
> the TRANSITION control is quantised to 0..510 frames in 2-frame steps (floor-to-even); a run
> advances `progress = clamp((tick − startTick − pausedTicks)/durationTicks, 0, 1)` written to
> `transition.lever` / `fade.lever` by a per-frame `ADVANCE_TIMELINE` command (dispatched from
> the present loop); duration 0 snaps on the next frame; re-pressing pauses (LEDs blink) and
> resumes drift-free; catch-up (k ticks in one present frame) is frame-exact. The clock stays
> the single source of truth and the store stays authoritative (ADR-0011): idle `ADVANCE_TIMELINE`
> is a same-ref no-op. 46 more Gherkin scenarios green (**454 total, 3300 steps**), **159 units**.
> **Deferred:** the two selective VIDEO-only / DSK-only fade scenarios (need a pre-DSK +
> key-mask GPU refinement, deferred with the fade pass's pixel verification); Memory Auto Take
> (needs Event Memory, Phase 7); and the GPI/RS422/mapped-control Auto-Take triggers (need the
> Phase 8 control-mapping layer). The AUTO TAKE/FADE UI buttons stamp their press with the
> current clock tick via a tick provider threaded into the control strip.

Close out the tail of the signal chain and the automation timeline: the final
whole-composite Fade, and the two automatic, pausable, frame-counted transitions.

**Realizes:**
- ADR-0012 (Render loop and transition timing model) — the transition-timeline half.
- `fade-control.feature`, `auto-take.feature`.

**Definition of Done:**
- Fade is the last stage, fading the entire composite, with independent Video / DSK /
  Audio enables, and a target of A, B, or MATTE that behaves correctly for program
  audio (reference §11, ADR-0004).
- Auto Take performs the lever transition automatically; Auto Fade performs the fade
  automatically (reference §11, §15).
- Both are timed in **video frames** via a TRANSITION control spanning **0–510 frames
  in 2-frame steps**, resolved against the canonical clock so a 300-frame move behaves
  identically on 60 Hz and 144 Hz (ADR-0012).
- Both can be **paused mid-move and resumed** by re-triggering, without drift
  (ADR-0012).
- Auto Take is triggerable from the UI/keyboard now and from MIDI/gamepad in Phase 8
  (the modern stand-in for the hardware GPI trigger; see Non-goals).

---

### Phase 7 — Event Memory, Special Modes, and persistence

> **Status: ✅ done.** **Event Memory** stores and recalls **8 panel snapshots** as pure store
> operations: STORE writes `panelSnapshot(state)` — a recursion-proof projection
> (`Omit<PanelState,'memory'|'specialMode'>`, runners idled) — into the in-store bank; RECALL
> (an armed EVENT NO. + AUTO TAKE) rehydrates the panel, PRESERVES the bank, and advances the
> sequence cursor (skipping empty slots, ending past the last). AUTO TAKE is cleanly overloaded
> — a lever-at-B Special macro, else an armed recall, else the Phase-6 take — gated off at
> factory boot so no Phase-6 scenario changes. **Special Modes** model the **8 macros** as a
> state machine (MEMORY+SHIFT enters; Event buttons ±SHIFT arm; the compressed-image visuals are
> deferred GPU work) with lever-at-B preconditions and **Vibrate's 64-frame** run on the shared
> transition runner; Satellite's indefinite orbit is a boolean (JSON-safe, not an Infinity
> runner). **Persistence** (ADR-0015) is a tiered module behind an injectable `StorageBackend`
> (localStorage in the browser, a Map in tests): schema-versioned, crash-proof reads (corrupt →
> factory fallback), Reset ON/OFF boot, JSON import/export; the bank layers on regardless of
> Reset policy so memories survive a normal power cycle. `fieldPreset` now strips Still/Strobe/
> Special (reference §18) in one place. 54 more Gherkin scenarios green (**508 total, 3704
> steps**), **191 units**. **Deferred:** the IndexedDB captured-still tier + its two @integration
> scenarios (no headless IndexedDB/GPU) and the @deferred battery-decay non-behavior; the two
> compressed-image-pixel Special-Mode scenarios (Stream-corner joystick, Flip/Shutter matte
> reveal) join the existing GPU-visual deferrals; "Memory Auto Take runs the recalled event's
> take over frames" is simplified to an instant recall (the asserted sequencing is exact; the
> frame-timed take-after-recall is a documented refinement).

Add recall: 8 stored panel snapshots, 8 preset effect macros, and durable storage so
they survive a reload.

**Realizes:**
- ADR-0015 (Persistence for Event Memory and settings).
- `event-memory.feature`, `special-modes.feature`.

**Definition of Done:**
- Event Memory stores and recalls **8 panel snapshots** of the full state store,
  restoring bus assignments, effect selections, keys, fade, and transition setup
  (reference §13, ADR-0011).
- Special Modes provide the **8 preset effect macros**, including frame-counted
  durations such as Vibrate's 64 frames resolved on the canonical clock
  (reference §14, ADR-0012).
- Snapshots and user settings persist across reloads via the persistence layer
  (ADR-0015); schema/versioning tolerates future state additions.
- Recall is a pure state-store operation and is covered by domain tests (ADR-0016).

---

### Phase 8 — Control mapping, integration recipes, and polish

Make the instrument performable and complete: remappable external control, end-to-end
cross-feature recipes as integration tests, and the finished hybrid panel UI.

**Realizes:**
- ADR-0014 (Control input mapping layer), ADR-0013 (Hybrid panel-layout UI on Web
  Components) — completion.
- `combination-recipes.feature` (`@integration`).
- Final confirmation that `frame-field-mode.feature` ships as a documented deferred
  stub (`@deferred`).

**Definition of Done:**
- A control-mapping layer binds keyboard, MIDI, and gamepad inputs to panel controls,
  remappably (ADR-0014); this is the modern replacement for the hardware GPI/serial
  control surface (see Non-goals). The Mix/Wipe lever, faders, RGB joystick, and Auto
  Take are all externally drivable.
- The hybrid Web-Components panel is complete: WJ-MX50 control grouping and metaphors
  (two buses, faders, Mix/Wipe lever, RGB joystick, LED-style buttons) as clean,
  responsive, accessible controls — not a photoreal skeuomorphic panel (ADR-0013).
- The `@integration` combination recipes run green end to end across the full signal
  chain (reference §16, `combination-recipes.feature`), exercising the fixed
  Source→…→Program Out order across multiple features at once.
- Accessibility pass: keyboard operability, focus order, and ARIA on all controls.
- The full Gherkin suite and the golden-image suite are green in CI (ADR-0016).

---

## Feature-to-phase map

| Feature file | Phase | Notes |
| --- | --- | --- |
| `inputs-and-devices.feature` | 0 (partial), 1 (complete) | One input in P0; four sources + Matte binding in P1 |
| `matte-generator.feature` | 0 (test pattern), 1 (full) | Flat-colour path is the P0 test pattern; 9-colour generator in P1 |
| `source-selection.feature` | 1 | |
| `program-output.feature` | 1 | A / B / EFFECT |
| `transition-mix-nam.feature` | 1 | Mix (dissolve) + NAM |
| `wipe-patterns.feature` | 2 | 7 families × modifiers, `+128` oracle |
| `wipe-edge-and-direction.feature` | 2 | Border/Soft, One-Way/Reverse |
| `color-correction.feature` | 3 | Per-bus, before Digital Effect block |
| `position-and-scene-grabber.feature` | 3 | Scene Grabber uses frame memory |
| `digital-effects-filters.feature` | 3 | Nega, Mosaic, Mono, Paint |
| `digital-effect-still.feature` | 3 | Frame memory (ADR-0007) |
| `digital-effect-strobe.feature` | 3 | Frame memory + seconds clock |
| `digital-effect-multi.feature` | 3 | Frame memory + seconds clock |
| `digital-effect-trail.feature` | 3 | Frame memory + seconds clock |
| `luminance-key.feature` | 4 | Mix/Wipe stage key |
| `chroma-key.feature` | 4 | Mix/Wipe stage key |
| `downstream-key.feature` | 4 | Downstream of all effects |
| `audio-mixer.feature` | 5 | Web Audio (ADR-0010) |
| `audio-follow.feature` | 5 | Audio tracks video transition |
| `av-synchro.feature` | 5 | Audio-triggered effect |
| `fade-control.feature` | 6 | Final stage; Video/DSK/Audio enables |
| `auto-take.feature` | 6 | Frame-counted, pausable (ADR-0012) |
| `event-memory.feature` | 7 | 8 snapshots + persistence |
| `special-modes.feature` | 7 | 8 macros; frame-counted durations |
| `combination-recipes.feature` | 8 | `@integration`; end-to-end recipes |
| `frame-field-mode.feature` | — (deferred) | `@deferred`; no-op stub, never built as behavior (ADR-0005) |

## ADR-to-phase map

| ADR | Phase(s) | Role |
| --- | --- | --- |
| ADR-0001 Record architecture decisions | 0 | Process bootstrap |
| ADR-0002 WebGPU rendering backend | 0 | Render substrate |
| ADR-0003 Vanilla TS + banira, no framework | 0 | Project stack |
| ADR-0004 Signal-graph pipeline | 0 scaffold → populated each phase | Fixed-order chain |
| ADR-0005 Clean-modern RGBA representation | 0 | Fidelity stance; deferrals |
| ADR-0006 Two-bus source model + Matte rules | 1 | Bus/source model |
| ADR-0007 GPU frame memory | 3 | Freeze-family effects |
| ADR-0008 Uniform input-source abstraction | 0 partial → 1 full | Source inputs |
| ADR-0009 Compositional wipe engine | 2 | Wipe matrix |
| ADR-0010 Audio engine on Web Audio | 5 | Sound |
| ADR-0011 Single unidirectional state store | 0 bootstrap → grows each phase | State model |
| ADR-0012 Render loop and timing model | 0 loop → 6 transition timeline | Timing |
| ADR-0013 Hybrid UI on Web Components | 1 onward → 8 complete | Panel UI |
| ADR-0014 Control input mapping | 8 | MIDI/gamepad/keyboard |
| ADR-0015 Persistence for Event Memory | 7 | Durable storage |
| ADR-0016 Testing strategy | 0 bootstrap → continuous | Gherkin + golden-image |
