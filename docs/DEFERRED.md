# Deferred work & known limitations

web-mx-50's **domain model is complete** (Phases 0–8): 208 `node:test` units and 537 Gherkin
scenarios (3937 steps) pass headlessly, and `banira compile` builds the whole app. This document
is the single consolidated inventory of what is **not** built or **not** CI-verified, and — the
part that matters — **which of it can still be built**.

Each item is tagged:

- **🟢 Buildable** — deferred only because it needs real WebGPU pixels, a device, or a browser
  gesture (so it can't be verified in headless CI). The domain/config for it is already done and
  tested; the work is writing the shader / wiring the device and confirming by browser smoke.
- **🟠 Out-of-model** — would require changing the domain model in a way that contradicts a
  *tested invariant* or the reference. Not buildable without sacrificing fidelity.
- **⚪ Out-of-scope** — deliberately not built, per an accepted ADR or because the source data is
  underivable. Should stay deferred.

> The one thing that spans everything: **golden-image pixel tests are stubbed for the entire
> renderer** because this environment has no headless-WebGPU adapter (see `test/golden/`, ADR-0016).
> That is an *environment* limit, not a code limit — a headless WebGPU runner (e.g. Deno `--webgpu`
> or a native harness) would let every already-rendering piece be pixel-pinned.

---

## 🟢 Buildable — GPU rendering not yet written

The domain math/state exists and is tested; only the WGSL + pass wiring is missing. Verify by
browser smoke (`npm run dev`).

| Item | Where | Notes |
|---|---|---|
| Trail ping-pong accumulator | `src/gpu/bus-processor.ts:52`, `src/ui/control-strip.ts:338` | Trail state modeled; the frame-memory accumulation buffer isn't rendered. |
| Compression / Slide / Blinds wipe geometry | `src/gpu/shaders/wipe.wgsl.ts:7` | Modifiers are in the domain; the shader falls through to the base field. |
| Five non-Normal DSK edge styles (border/shadow) | `src/gpu/dsk.ts:3`, `src/gpu/shaders/dsk.wgsl.ts:4` | Normal fill only; the EDGE cycle + colours are modeled. |
| A/V-Synchro → picture gating | `src/main.ts:115`, `src/audio/av-synchro-tap.ts` | The tap already computes the pulsed-effect set per frame; feed it into the bus-effect shader to force those effects on. |
| Scene-Grabber freeze-in-place | `src/core/positioner.ts` (domain done) | GPU freeze of the pixels inside the moving inset. |
| Selective VIDEO-only / DSK-only fade | `src/gpu/fade.ts` | Needs a pre-DSK composite + key-mask so the title and picture fade independently. Unblocks `features/fade-control.feature` "Fading VIDEO only…", "Fading DSK only…". |
| Special-Mode compressed-image macros (geometry) | `src/core/special-mode.ts:5` | The 8-macro state machine is done; the compressed-inset looks (Stream/Cork Screw/Bounce/Flip/Shutter/Satellite) aren't. Unblocks `special-modes.feature` "Stream corner…", "Flip and Shutter reveal the Matte colour". |
| Combination-recipe looks (After-Image ghosts, Mosaic-Spotlight / PiP inset pixels) | `features/combination-recipes.feature` S8/S9 | Setups are composable + green at the domain level; the ghost/inset *pixels* aren't rendered. |

## 🟢 Buildable — browser I/O (some already written, CI-excluded)

| Item | Where | Notes |
|---|---|---|
| Real audio-input capture | `src/audio/engine.ts` | Replace the stand-in oscillators with `MediaStream` / `MediaElement` sources. Small, high value. |
| EXT.CAMERA GPU binding | `src/engine/renderer.ts:88` | Currently falls back to the composite; needs `getUserMedia` → external texture for the DSK key source. |
| IndexedDB still-blob tier (async `BlobBackend`) | `src/persistence/backend.ts:4` | The `StorageBackend` seam is designed for it; a blob backend + GPU still readback unblocks `event-memory.feature` "…carries a captured still…", "…references a still reloads the pixels…". |
| File import/export DOM glue | `src/persistence/persistence.ts` (`exportPreset`/`importPreset`) | The versioned-JSON codecs exist; only the download/upload wiring is missing. |
| Real browser-input device binding | `src/sources/source.ts:8`, `src/sources/binding.ts` | **Partially landed:** `VideoSource` (`src/sources/video-source.ts`) now backs all four Sources with live video (demo feeds + local files, `src/ui/demo-feeds.ts`). Still open: `getUserMedia` camera capture, still images, and the zero-copy `importExternalTexture` path. |
| Gamepad / Web MIDI / Web Serial adapters | `src/control/{gamepad,midi,serial}.ts` | **Already written and wired** from `main.ts` (Phase 8); a real MIDI controller or gamepad drives the mixer today. Only CI-excluded (the APIs are undefined under node). |

## 🟢 Buildable — domain-composable `@integration` not yet wired

These need **no new production code** — just step definitions using existing selectors, like the
cross-feature `@integration` scenarios wired in Phase 8. (The Phase-8 sweep skipped them, wrongly
assuming their plainer, already-green counterparts covered them.)

| Scenario | Feature | Assertion available via |
|---|---|---|
| The A / B button sends the bus directly, bypassing all effects | `program-output.feature` | `programVideo().effectApplied === false`; `programAudioMix` (bus + aux, Master bypassed). |
| The EFFECT button sends the fully processed composite | `program-output.feature` | `programVideo().effectApplied === true`; `programAudio().masterGoverns`. |
| Preview lets me monitor the effect while sending a clean bus | `program-output.feature` | `PREVIEW_IS_ALWAYS_EFFECTED` + `programVideo()`. |

---

## 🟠 Out-of-model — would break a tested invariant

Building these means changing the domain model against a spec-derived rule the tests enforce.

| Scenario(s) | Feature | The invariant it violates |
|---|---|---|
| Auto-Take double effect "instantly"; the double-effect recipes S1–S3 | `auto-take.feature:174`, `combination-recipes.feature` | The Digital Effect block targets **one bus at a time** (`DigitalEffectState.bus`; `SELECT_EFFECT_BUS` clears the other bus — tested by digital-effects-filters "An effect applies to only one bus at a time"). Two live effects on both buses is not representable without going per-bus and breaking that test. The composable kernel (a 0-frame Auto Take snaps with no blend) **is** green. |
| Multi / Live mixing (recipes S11–S13) | `combination-recipes.feature` | Compression ⊥ Strobe (reference §8.5/§8.6): `PRESS_COMPRESSION` no-ops while Strobe is on, and engaging Strobe clears Compression (`src/state/reducer.ts`). "Compression + Strobe together" cannot exist in the store. (Also pixel-visual.) |

## ⚪ Out-of-scope — deliberately not built

| Item | Where | Why |
|---|---|---|
| Frame-field interlace scenarios (4) | `frame-field-mode.feature` (`@deferred`) | Clean-modern video is full-resolution progressive RGBA with no interlace fields to trade (ADR-0005 §6). The **v1 no-op contract is implemented and CI-green** (`FRAME_MODE_AFFECTS_OUTPUT`); the interlace-behaviour scenarios are documentation only. |
| Strobe frame-mode duplicate | `digital-effect-strobe.feature:83` (`@deferred`) | Redundant restatement of the frame no-op contract already pinned across Still/Strobe/Multi/Trail. |
| Battery-backed memory decay | `event-memory.feature:178` (`@deferred`) | The hardware's few-days battery limit has no browser analogue; stored slots persist until cleared (ADR-0015 — expiry intentionally not emulated). |
| Underivable Pattern-Table parts | `wipe-patterns.feature:231/238`, `matte-generator.feature:121` (`@wip`) | Panel-only pattern numbering / invalid-cell selectability / the White-GRADATION brightness axis are not derivable from the reference PDF without mining the pattern table. |
| Analog / genlock timing (Black Burst, frame-sync, field timing) | — | ADR-0005 drops analog emulation; browser sources are discrete frames with no VTR to genlock. |
| Golden-image pixel tests (all passes) | `test/golden/` | No headless-WebGPU adapter in this environment (ADR-0016). Environment limit, not code limit — see the note at the top. |

---

## Suggested next steps (highest leverage first)

1. **Real audio-input capture** + **A/V-Synchro → bus-effect gating** — small, and they make the
   instrument audibly/visibly "come alive"; both build on already-computed state.
2. **Remaining picture shaders** — Compression/Slide/Blinds wipe, the five DSK edge styles, Trail
   ping-pong — pure WGSL over finished domain logic.
3. **IndexedDB still tier + file import/export glue** — small; unblocks the two still `@integration`
   scenarios and gives portable presets a UI.
4. **Wire the 3 program-output `@integration` scenarios** — pure step-definition work, no new code.

Nothing in the 🟠/⚪ buckets should be built without first revisiting the ADR it rests on.
