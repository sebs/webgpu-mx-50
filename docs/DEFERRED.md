# Deferred work & known limitations

web-mx-50's **domain model is complete** (Phases 0–8) and, as of the Phase-9 GPU sweep, **every
deferred picture pass is written**: 280 `node:test` units and 545 Gherkin scenarios (3996 steps)
pass headlessly, and `banira compile` builds the whole app. This document is the single
consolidated inventory of what is **not** built or **not** CI-verified, and — the part that
matters — **which of it can still be built**.

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

## ✅ Built — the former "GPU rendering not yet written" bucket (Phase 9)

All eight rows landed in one sweep. Each one follows the house pattern: the geometry/state math
is a **pure `src/core/` function** the headless specs pin, and the WGSL consumes the same
formula. Pixel confirmation remains browser smoke (`npm run dev`) until a headless-WebGPU runner
exists (ADR-0016).

| Item | Where it landed |
|---|---|
| Trail ping-pong accumulator | `src/gpu/trail.ts` + `trail.wgsl.ts` (per-bus, fed by `BusProcessor`); copy geometry in `core/digital-effect.ts` (`trailCopyRect` et al.) |
| Compression / Slide / Blinds wipe geometry | affine remaps in `core/wipe.ts` (`revealRect`, `compressionAffine`, `slideAffine`, `blindsAxes`), consumed by `wipe.wgsl.ts`; centred Split/Square REVERSE now runs inward |
| Five non-Normal DSK edge styles | `core/dsk.ts` (`dskEdgeGeometry`) + multi-tap border/shadow rendering in `dsk.wgsl.ts`, GRADATION-graded white-fill edges |
| A/V-Synchro → picture gating | pulsed set threaded `main.ts` → `Renderer.render` → `BusProcessor`; merge logic in `core/av-synchro.ts` (`effectiveFilterOn`, `stepAvSynchroStrobe` — Strobe holds on the Effect Interval Timer) |
| Scene-Grabber freeze-in-place | grab-edge blit + latched inset geometry in `gpu/wipe.ts` (`trackGrab`); sample math in `core/positioner.ts` (`grabCapture`, `grabSampleUV`); the inset is now lever-sized (`effectiveInsetSize`) |
| Selective VIDEO-only / DSK-only fade | renderer fades the PRE-DSK composite by the VIDEO amount; the DSK element rides the key mask (`dskFade` uniform, `core/fade.ts dskTitleOpacity`). Unblocked both `fade-control.feature` selective scenarios |
| Special-Mode compressed-image macros | `core/special-mode-geometry.ts` (`macroFrame`/`specialFrame`) + `gpu/special-fx.ts` + `special-fx.wgsl.ts`. Unblocked the two `special-modes.feature` picture scenarios |
| Combination-recipe looks | After-Image = Strobe+MIX (selectors in `core/after-image.ts`, S8/S9 scenarios wired); PiP compressed-inset pixels via the wipe posOn branch; Mosaic-Spotlight REVERSE via the inset mask flip |

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

1. **Real audio-input capture** (`src/audio/engine.ts`) — replace the stand-in oscillators with
   `MediaStream` sources; the A/V-Synchro picture gating it feeds is already live.
2. **IndexedDB still tier + file import/export glue** — small; unblocks the two still
   `@integration` scenarios and gives portable presets a UI. `WipePass.freeze` is the designed
   readback/injection point for the Scene-Grabber still.
3. **Wire the 3 program-output `@integration` scenarios** — pure step-definition work, no new code.
4. **A headless-WebGPU runner** (Deno `--webgpu` or a native harness) — would let every
   now-rendering pass be pixel-pinned in `test/golden/`, retiring the last environment limit.

Nothing in the 🟠/⚪ buckets should be built without first revisiting the ADR it rests on.
