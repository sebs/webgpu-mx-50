# ADR-0012: Render loop and transition timing model

- Status: Accepted
- Date: 2026-07-24
- Deciders: project owner

## Context and Problem Statement

Almost every dynamic behaviour in the WJ-MX50 is timed. The freeze-family digital
effects step on intervals expressed in **seconds** — Strobe ~0.03 s to 2.1 s
(reference 8.6), Multi ~0.07 s to 2.1 s (reference 8.7), Trail ~0.07 s to 2.1 s
(reference 8.8). The two automatic transitions — Auto Take (reference 15) and Auto
Fade (reference 11) — are timed in **video frames**, set with a TRANSITION control
spanning **0 to 510 frames in 2-frame steps**, and both can be **paused mid-move and
resumed** by pressing the button again. Special Modes carry their own frame-counted
durations (e.g. Vibrate lasts 64 frames, reference 14).

The browser gives us one native timing primitive for animation: `requestAnimationFrame`
(rAF), which fires once per display refresh at a rate we do not control (60 Hz, 120 Hz,
variable). We need a timing model that:

- drives WebGPU rendering (ADR-0002 (WebGPU as the rendering and compute backend)) once
  per display frame, on whatever refresh the monitor runs;
- gives effect timers and transitions a **stable, monitor-independent notion of time**,
  so a Strobe interval or a 300-frame Auto Fade behaves identically on a 60 Hz and a
  144 Hz panel, and so golden-image tests (ADR-0016 (Testing strategy)) are
  deterministic;
- reconciles the hardware's two time units — **seconds** (effect intervals) and **NTSC
  video frames** (transitions) — against a single canonical clock;
- supports pause/resume of Auto Take and Auto Fade without drift;
- feeds the freeze-effect capture controller (ADR-0007 (GPU frame memory for
  freeze-family effects)), which asked for "deterministic capture timing driven by the
  render/transition clock".

The open question is how to structure the loop so that presentation cadence and logical
time are cleanly separated, and how to map hardware frame counts onto it.

## Decision Drivers

- **Determinism and testability.** The same input plus the same elapsed logical time
  must produce the same output regardless of display refresh rate or frame-drop jitter
  (ADR-0016 (Testing strategy)).
- **Fidelity to the reference's two units.** Effect intervals in seconds
  (8.6–8.8); Auto Take / Auto Fade in 0–510 frames in 2-frame steps (11, 15); Special
  Mode frame durations (14).
- **Monitor independence.** Correct behaviour on 60 Hz, 120 Hz, 144 Hz and variable-
  refresh displays.
- **Pause/resume without drift** for both automatic transitions (11, 15).
- **Clean separation from the UI layer.** The render loop must stay independent of the
  reactive/Web-Component UI (ADR-0013 (Hybrid panel-layout UI on Web Components)), reading
  state from the store (ADR-0011 (Single unidirectional panel state store)) rather than
  being driven by DOM events.
- **Robustness to background tabs**, where rAF is throttled or paused.

## Considered Options

### Option A — Pure rAF: advance everything by the real delta each callback

Every rAF callback measures `deltaMs` since the last one and advances all timers and
transitions by that real elapsed time.

- Good: simplest possible loop; no accumulator.
- Bad: logical state becomes a function of display refresh and scheduling jitter. A
  dropped frame produces a large delta and a visible jump; a 144 Hz panel subdivides
  motion differently from 60 Hz. Frame-counted transitions have no stable "frame" to
  count — you must convert every delta to fractional frames, and rounding drifts.
  Non-deterministic, so golden-image tests cannot pin a frame. Rejected.

### Option B — Assume rAF == 60 Hz, count callbacks as frames

Treat each rAF callback as exactly one NTSC frame and count callbacks directly.

- Good: frame counts map trivially (1 callback = 1 frame); dead simple for Auto Take.
- Bad: false on any display that is not 60 Hz. On 120 Hz an Auto Fade finishes in half
  the wall-clock time; on a throttled tab it stalls. Ties logical time to hardware we do
  not control. Rejected.

### Option C (chosen) — rAF present loop over a fixed-timestep logical clock with an accumulator

Split the loop into two layers. The **present layer** is the rAF callback: it measures
real elapsed time, feeds an accumulator, then renders the current logical state to the
GPU once per display frame. The **logical layer** is a fixed-timestep clock that the
accumulator steps in whole **logical ticks** of a canonical duration; all effect timers,
transitions, and Special Modes read this clock only. Presentation cadence and logical
time are thereby decoupled.

- Good: logical behaviour is monitor-independent and deterministic; a single canonical
  tick underlies both seconds and frames; pause is just "stop feeding the accumulator";
  tests can drive the logical clock directly with no display at all.
- Bad: the accumulator/interpolation split is a well-known but non-trivial pattern
  implementers must get right (spiral-of-death guard, clamped catch-up).
- Neutral: introduces a small explicit clock object rather than reading `performance.now()`
  ad hoc throughout the codebase.

## Decision Outcome

Chosen option: **C — an rAF present loop over a fixed-timestep logical clock**.

### The canonical frame rate

The logical clock ticks at a **canonical 60 ticks per second**, and **one logical tick
is defined as one WJ-MX50 video frame**. This is the single conversion constant the whole
app shares.

The reference is an NTSC device, and true NTSC runs at **59.94 fps** (30000/1001), not a
flat 60. We adopt **60.00 fps as the canonical logical frame** for three reasons: the
clean-modern fidelity decision (ADR-0005 (Clean-modern RGBA video representation; defer
analog emulation)) explicitly drops frame-synchronizer and field timing, so there is no
analog timebase to honour; browser sources arrive as already-timed discrete frames
(ADR-0008 (Uniform input-source abstraction)) with no shared 59.94 clock; and 60 maps
1:1 onto the commonest display refresh, making the present layer's common case exact. The
0.1 % difference between 60 and 59.94 is recorded as a single constant
`NTSC_FRAME_HZ = 60` so that, should analog-accurate timing ever be un-deferred, every
frame-to-seconds conversion changes in one place. **Frame counts therefore map as:
frames = seconds × 60, and one Auto Take/Fade "frame" equals one 1/60 s logical tick.**

### The present loop (rAF layer)

Each rAF callback:

1. Reads `timestamp` (the high-resolution time rAF supplies) and computes
   `deltaMs = timestamp - lastTimestamp`.
2. **Clamps** `deltaMs` to a ceiling (250 ms) before use, so a long stall or a
   returning background tab cannot inject a huge catch-up burst (spiral-of-death guard).
3. Adds the clamped delta to the accumulator and steps the logical clock (below).
4. Renders exactly one GPU frame from the current logical state. Because effects and
   transitions are continuous quantities read as "value at logical time T", the present
   layer can **interpolate** the transition/fade position to the sub-tick fraction left
   in the accumulator for smooth motion on high-refresh displays, without advancing
   logical state.

The present loop owns no behavioural state beyond timestamps and the accumulator; it
reads the panel store (ADR-0011) and writes pixels. This keeps it independent of the Web
Component UI layer (ADR-0013).

### The fixed-timestep logical clock

The clock exposes a monotonically increasing **tick count** (whole video frames since
start) and steps in fixed increments of `1000 / 60 ≈ 16.667 ms`:

```
accumulator += clampedDeltaMs
while (accumulator >= TICK_MS) {      // TICK_MS = 1000 / 60
    advanceOneTick()                  // tick += 1; step all timers/transitions
    accumulator -= TICK_MS
}
```

`advanceOneTick()` is the single place logical time moves. It advances effect-interval
timers, automatic-transition progress, and Special-Mode frame counters by exactly one
frame. Everything downstream is a pure function of the tick count, so a test can call
`advanceOneTick()` N times headlessly and assert the exact resulting state — no rAF, no
display, no wall-clock.

### Effect-interval timers (seconds → ticks)

Strobe, Multi, and Trail intervals are set in seconds by their TIME controls
(reference 8.6–8.8). Each is converted once to an integer **tick period**
`period = round(seconds × 60)`, clamped to the documented range:

- **Strobe:** 0.03 s → ~2 ticks, 2.1 s → 126 ticks.
- **Multi / Trail:** 0.07 s → ~4 ticks, 2.1 s → 126 ticks.

The freeze-effect capture controller (ADR-0007) fires a capture when
`tick - lastFireTick >= period`. Because the period is in whole ticks and firing is
tested against the logical clock, Strobe stop-motion, Multi tile-stepping, and Trail
spacing are frame-accurate and reproducible. Sub-2-tick periods at the fastest Strobe
setting are honoured directly (capture up to every logical frame).

### Automatic transitions (frames, 0–510, 2-frame steps)

**Auto Take (reference 15)** and **Auto Fade (reference 11)** share one transition-runner
abstraction. The TRANSITION control yields a duration in frames: an integer in **0…510
constrained to even values** (2-frame steps), matching the hardware indicator. That value
is the runner's `durationTicks` (0 means an instant snap — the "transition time at MIN"
case that makes Auto Take jump between effects, reference 16). On start, the runner records
`startTick`; each `advanceOneTick()` recomputes

```
progress = clamp((tick - startTick - pausedTicks) / durationTicks, 0, 1)
```

which drives the Mix/Wipe position (ADR-0009 (Compositional wipe-pattern engine)) for Auto
Take, or the fade lever position for Auto Fade. At `progress == 1` the transition latches
complete. A `durationTicks` of 0 completes on the first tick. The runner is unit-agnostic
about *what* it moves — Auto Take drives the transition/key composite; Auto Fade drives the
Fade stage with its independent Video/DSK/Audio enables (reference 11) — so both reuse the
same tested timing core.

### Pause and resume

Both transitions pause and resume by re-pressing the button (reference 11: "Pressing it
again mid-fade pauses … pressing again resumes"; reference 15: "Press again mid-take to
pause … again to resume"). Pause does **not** stop the logical clock (freeze effects and
the render loop keep running); instead the runner enters a `paused` state and accumulates
`pausedTicks` for every tick spent paused. Because `progress` subtracts `pausedTicks`, the
transition freezes exactly at its current position and resumes from there with **no drift**
and no lost frames. The panel LEDs blink while paused (bus LEDs for Auto Take, the enabled
Fade button's LED for Auto Fade), driven from the runner's state via the store (ADR-0011).
GPI-triggered Auto Take (reference 17, falling edge) enters the same runner.

### Background tabs and pauses

When the tab is hidden, rAF stops firing; the accumulator therefore does not advance, so
logical time simply halts — the mixer "waits" rather than fast-forwarding. On return, the
first delta is clamped (250 ms ceiling), so at most a bounded catch-up occurs. This is the
desired behaviour for a live performance tool: a backgrounded mixer should resume where it
was, not leap ahead. Audio timing lives on the Web Audio clock (ADR-0010 (Audio engine on
the Web Audio API)); the visual logical clock and the audio clock are kept loosely
coupled, with the transition runner as the authority for Audio Follow / Audio Fade
proportions so audio and video transitions stay aligned.

### Consequences

**Good**

- Logical behaviour is deterministic and monitor-independent: a 300-frame Auto Fade takes
  5.00 s of logical time on any display, and a Strobe interval is identical everywhere.
- One canonical constant (`NTSC_FRAME_HZ = 60`, `TICK_MS = 1000/60`) unifies the reference's
  two time units; seconds and frames both reduce to ticks.
- Headless, display-free testing: golden-image and behavioural tests step the logical clock
  directly, so Strobe/Multi/Trail spacing and transition curves are pinned frame-exactly
  (ADR-0016).
- Pause/resume is drift-free by construction (subtract paused ticks), matching the reference
  for both Auto Take and Auto Fade.
- High-refresh displays get smooth motion via sub-tick interpolation in the present layer,
  without changing logical outcomes.
- The loop stays decoupled from the UI framework-free Web Component layer (ADR-0013),
  reading the store and writing pixels only.

**Bad**

- The accumulator / fixed-timestep pattern (catch-up loop, clamp, interpolation) is more
  machinery than a naive "advance by delta" loop and must be implemented carefully to avoid
  a spiral of death or visible stutter.
- Canonical 60 fps is a deliberate ~0.1 % departure from true NTSC 59.94; correct for the
  clean-modern scope but a value to revisit if analog timing is ever un-deferred.

**Neutral**

- Introduces an explicit clock/loop module that other systems (freeze capture, transitions,
  Special Modes, Audio Follow) depend on, rather than scattered `performance.now()` reads.
- Special Mode frame durations (e.g. Vibrate's 64 frames, reference 14) are expressed as
  tick counts on the same clock, so they need no separate timing path.

## More Information

- Reference: sections 8.6 (Strobe interval ~0.03–2.1 s), 8.7 (Multi interval ~0.07–2.1 s),
  8.8 (Trail interval ~0.07–2.1 s), 11 (Fade Control — Auto Fade 0–510 frames in 2-frame
  steps, pause/resume), 15 (Auto Take — TRANSITION 0–510 frames in 2-frame steps,
  pause/resume), 14 (Special Mode frame durations), 19 (NTSC specification).
- ADR-0002 (WebGPU as the rendering and compute backend) — what the present layer renders to.
- ADR-0005 (Clean-modern RGBA video representation; defer analog emulation) — why 60 fps
  canonical rather than 59.94, and why field timing is moot.
- ADR-0007 (GPU frame memory for freeze-family effects) — the capture controller this clock
  drives.
- ADR-0008 (Uniform input-source abstraction) — sources arrive as already-timed frames.
- ADR-0009 (Compositional wipe-pattern engine) — Auto Take drives the wipe position.
- ADR-0010 (Audio engine on the Web Audio API) — the loosely-coupled audio clock.
- ADR-0011 (Single unidirectional panel state store) — where the loop reads state and
  mirrors LED/blink states.
- ADR-0013 (Hybrid panel-layout UI on Web Components) — the UI layer the loop stays
  independent of.
- ADR-0016 (Testing strategy: Gherkin domain specs plus golden-image shader tests) — how the
  deterministic clock is exercised.
- Features: digital-effect-strobe.feature, digital-effect-multi.feature,
  digital-effect-trail.feature, auto-take.feature, fade-control.feature,
  special-modes.feature, audio-follow.feature.
