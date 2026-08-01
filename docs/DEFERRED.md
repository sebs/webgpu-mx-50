# Deferred work & known limitations

web-mx-50's **domain model is complete** (Phases 0–8) and, as of the Phase-9 GPU sweep and the
Phase-10 browser-I/O sweep, **every deferred picture pass and every browser-I/O tier is
written**: 330 `node:test` units and 563 Gherkin scenarios (4137 steps) pass headlessly, and
`banira compile` builds the whole app. This document is the single consolidated inventory of
what is **not** built or **not** CI-verified, and — the part that matters — **which of it can
still be built**.

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

## ✅ Built — the former "browser I/O" bucket (Phase 10)

All six rows are landed (the Gamepad/MIDI/Serial row was already built in Phase 8). Each follows
the house pattern: the decision-shaped logic is a **pure headless seam** the specs pin
(`programFadeSourceMix`, `MediaDeviceCatalog`, `camera-lifecycle`, `StillStore`, `preset-file`),
and the browser glue stays thin, typechecked, and CI-excluded. Verification of the glue itself is
browser smoke (`npm run dev`).

| Item | Where it landed |
|---|---|
| Real audio-input capture | `src/audio/engine.ts` rebuilt: per-slot `MediaElementAudioSourceNode` taps on the feed videos (gesture-attached, unmuted behind zeroed faders), demand-driven getUserMedia mic (`core/audio.ts micCaptureWanted`), per-source routing via `core/fade.ts programFadeSourceMix`. Aux1/Aux2 keep stand-in oscillators (no browser jack); the mic deliberately has no fake fallback. |
| EXT.CAMERA GPU binding | `src/sources/camera-source.ts` (+ pure `camera-lifecycle.ts`) registered as `'ext-camera'` in the widened `SourceRegistry`; renderer keys through `core/dsk.ts dskKeyFeed` with the composite stand-in preserved; `src/ui/ext-camera-monitor.ts` card on the source wall; `bindExtCamera` on the binding registry. Unblocked the 3 External-Camera scenarios. |
| IndexedDB still-blob tier | `BlobBackend` (`IndexedDbBlobBackend`/`MemoryBlobBackend`) + `src/persistence/still-store.ts` (blob-FIRST two-tier commits, orphan sweep, promise-queue ordering) + `PositionerState.stillId` minted in the reducer + `WipePass.readStill/injectStill` (256-aligned readback via pure `gpu/readback.ts`). Unblocked both `event-memory.feature` still scenarios. |
| File import/export DOM glue | pure `src/persistence/preset-file.ts` (names, feedback, size cap) + thin `file-io.ts` (download/upload) + the `LOAD_BANK` command (bank-only live import; latches cleared, live panel untouched) + Export/Import buttons in the console's Event Memory block. |
| Real browser-input device binding | feed pickers grew Camera (gesture-gated `CameraFeedController`) and Still (`ImageSource`, upload-once) options; `mx-feed-bound`/`mx-feed-unavailable` events mirror into `engine.bindings` (+ `activeProvider`) and swap the registry entry; `MediaDeviceCatalog` models permission-gated enumeration headlessly. Unblocked 9 device/permission scenarios. |
| Gamepad / Web MIDI / Web Serial | Written and wired (Phase 8), hardened by browser smoke: the Serial GPI adapter no longer calls the gesture-gated `requestPort()` at boot (a `SecurityError`) — `start()` re-attaches already-granted ports via `getPorts()` + the `connect` event, and the port chooser lives behind the header's "GPI…" button. CI-excluded because the APIs are undefined under node. |

**`importExternalTexture` — assessed and deliberately not built.** It is not zero-copy in this
app's shape (the contained blit-pass variant re-introduces the same one conversion write that
`copyExternalImageToTexture` already performs, plus per-frame bind-group churn and an sRGB
reinterpretation dance), and full `texture_external` adoption would invade every consuming shader
while breaking the freeze-family `copyTextureToTexture` contract. The one measurable win —
skipping redundant imports — is mechanism-independent and landed instead as
`requestVideoFrameCallback` dirty-gating in `VideoSource` (a 30 fps clip on a 120 Hz display now
imports 30×/s, not 120×). Revisit if: profiling shows the copy >~1 ms/frame on a target platform;
sources become WebCodecs `VideoFrame`s; or HDR/wide-gamut camera sources arrive.

## ✅ Already wired — the former "domain-composable `@integration`" bucket

This bucket turned out to be **stale, not deferred**: cucumber's `name` filters are
partial-match regexes, and the include-list entries ("The A button sends the A-bus directly",
"Preview lets me monitor the effect while sending a clean bus", …) have always matched these
very `@integration` scenarios — there are no plainer counterparts in
`program-output.feature`. All four (A-bypass, B-bypass, EFFECT-composite, and the two-row
Preview outline) execute and pass, and their step definitions assert exactly the selectors
this table prescribed: `programVideo().effectApplied`, `programAudio().masterGoverns`, the
7-input contributor list, and `PREVIEW_IS_ALWAYS_EFFECTED`
(`test/features/steps/mixer.steps.ts`). The include-list names are now the full scenario
titles, so the coverage is explicit rather than an accident of prefix matching.

---|---|---|
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

1. **A headless-WebGPU runner** (Deno `--webgpu` or a native harness) — would let every
   now-rendering pass be pixel-pinned in `test/golden/`, retiring the last environment limit.
2. **Browser smoke sweep** of the Phase-9/10 work (`npm run dev`): the GPU looks, camera/mic
   permission flows, still store/recall across a reload, and preset export/import.

Nothing in the 🟠/⚪ buckets should be built without first revisiting the ADR it rests on.
