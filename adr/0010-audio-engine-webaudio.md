# ADR-0010: Audio engine on the Web Audio API

- Status: Accepted
- Date: 2026-07-24
- Deciders: project owner

## Context and Problem Statement

The WJ-MX50 is an audio/video mixer: every video path carries audio with it. Selecting a
source on a bus selects both its video and its audio (reference section 3), the Audio Mix
section governs seven inputs through five faders (reference section 5), the Fade block can
fade audio in lockstep with video with target-dependent nuances (reference section 11),
Audio Follow ties the A/B audio crossfade to the Mix/Wipe lever (reference section 12), and
A/V Synchro pulses digital effects from the audio envelope (reference section 8.9). Audio is
therefore not a bolt-on — it is a first-class signal domain that must run alongside the
WebGPU video graph and stay sample-accurate independently of the render loop.

We need one browser audio substrate that can express: a small routing/gain graph mirroring
the hardware Audio Mix; per-input level metering for the LED Audio Level Indicator; a
lever-driven crossfade for Audio Follow; a fade stage whose behaviour depends on the fade
target; and an envelope-follower with an adjustable threshold that emits trigger events into
the video effect layer for A/V Synchro. It must not fight the render loop (ADR-0012 (Render
loop and transition timing model)) and must be driven from the same panel state
(ADR-0011 (Single unidirectional panel state store)).

Two hardware notes shape the design. First, headphone monitoring is deliberately *not*
affected by fades (reference sections 2, 11), so the monitor tap must sit upstream of the
fade stage. Second, the A/B direct Program Out modes pass only that bus's audio plus the
aux/mic inputs, while EFFECT passes the full mix under the Master fader (reference sections
2, 5) — so Program Out selection (ADR-0006 (Two-bus source model)) reshapes the audio sum,
not just the video.

## Decision Drivers

- Fidelity to reference 5 (Audio Mixer), 11 (Fade), 12 (Audio Follow), 8.9 (A/V Synchro).
- A single, declarative audio graph that maps one-to-one onto the hardware fader/routing model.
- Sample-accurate gain automation for fades and Auto Fade, decoupled from video frame timing.
- Low-latency envelope metering for both the level indicator and the A/V Synchro trigger.
- Driven from panel state (ADR-0011); no bespoke audio-only UI state.
- No third-party audio library — consistent with the vanilla-stack decision
  (ADR-0003 (Vanilla TypeScript with banira and no UI framework)).
- Testable gain math and trigger logic (ADR-0016 (Testing strategy)).

## Considered Options

### Option A — Manual mixing in an AudioWorklet / ScriptProcessor

Sum and scale all inputs by hand in a custom DSP node.

- Good: total control; trivial to co-locate envelope detection.
- Bad: reimplements gain summing, smoothing, and metering that the platform provides for free;
  more surface for glitches and denormals; harder to test; overkill for a fader mixer. Rejected
  as the default, though a single worklet remains an option for the envelope follower (below).

### Option B — Off-the-shelf web audio mixing library

Adopt a routing/mixer library.

- Good: less wiring.
- Bad: a dependency for what is a dozen native nodes; contradicts ADR-0003; libraries rarely
  model our exact fader-follow/fade-target semantics, so we would fight the abstraction. Rejected.

### Option C (chosen) — Native Web Audio API graph of GainNodes plus AnalyserNodes

Build the mixer directly from the platform: one `AudioContext`, a fixed graph of `GainNode`s
for the faders and routing, `AnalyserNode`s for metering and the trigger envelope, and
sample-accurate `AudioParam` automation for fades. An optional single `AudioWorkletNode`
provides a tighter envelope follower if `AnalyserNode` RMS proves too coarse.

- Good: the graph *is* the hardware block diagram; gain automation, smoothing, and FFT/time-domain
  metering are native and battle-tested; no dependency; runs on its own audio thread, fully
  decoupled from the render loop.
- Bad: browser autoplay policy requires a user gesture to `resume()` the context; `AnalyserNode`
  gives RMS/peak but not a true fast envelope, so A/V Synchro may need the worklet.
- Neutral: the graph is static in shape; only gain values and the Mic/Aux2 routing switch change
  at runtime.

## Decision Outcome

Chosen option: **C — a native Web Audio graph of `GainNode`s and `AnalyserNode`s.** One shared
`AudioContext`, `resume()`d on the first user gesture. Every source from the input abstraction
(ADR-0008 (Uniform input-source abstraction)) contributes an audio `MediaStreamAudioSourceNode`
or `MediaElementAudioSourceNode`; the Matte contributes silence.

**Graph shape (reference 5).** Seven physical input gain nodes mirror the seven mixed inputs —
Source 1, Source 2, Source 3, Source 4, Aux 1, Aux 2, and Mic — each a per-input trim/enable gain.
Above them sit the five fader gains of the hardware:

- **A-bus fader gain** — fed by whichever source's gain node is currently assigned to A-bus.
- **B-bus fader gain** — fed by whichever source is assigned to B-bus.
- **Aux 1 fader gain** — fed by the Aux 1 input.
- **Mic/Aux2 fader gain** — fed by *either* the Mic or the Aux 2 input, selected by the
  front-panel Mic/Aux2 switch (reference 2, 5); the switch is a routing change, not a mix, so
  only one of the two connects at a time.

Bus assignment routes an input's gain node to the A- or B-bus fader gain by (re)connection when
the panel's source selection changes, so "selecting a source selects its audio" (reference 3) is
literally a graph edge. The four fader gains sum into the **Master fader gain**, then into a
**fade stage gain**, then to `context.destination` (Program Out). This ordering places Master
before Fade, matching the signal flow where Fade is the final stage (reference sections 1, 11).

**Fader mapping.** Each hardware fader maps to its `GainNode.gain`. Fader travel is mapped through
a perceptual (roughly logarithmic) curve so 0 dB program level sits mid-travel, matching the
manual's advice to balance the four input faders around 0 dB on the LED Audio Level Indicator
(reference 5). Fader writes come from panel state (ADR-0011); UI never touches nodes directly.

**Metering — Audio Level Indicator (reference 5).** An `AnalyserNode` tapped at the Master fader
output drives the LED level indicator; the UI polls its time-domain buffer for peak/RMS on the
render tick and lights LED segments accordingly. Per-input analysers are optional for future
per-channel meters but are not required for v1.

**Program Out audio (reference 2, 5).** Program Out selection (ADR-0006) reshapes the sum. In
**EFFECT** mode the full mix flows through Master and Fade as above. In **A** or **B** direct
mode the output is that single bus's fader gain plus Aux 1 and Mic/Aux2, bypassing the opposite
bus and the video-effect-driven parts of the mix; this is a selectable set of connections into a
dedicated direct-out gain, not a second graph.

**Audio Follow (reference 12).** When Audio Follow is engaged, the A-bus and B-bus fader gains are
slaved to the Mix/Wipe lever position: lever at A → full A / zero B, centre → both, lever at B →
zero A / full B, using an equal-power crossfade so the mid-lever sum does not dip. Aux 1 and
Mic/Aux2 are *excluded* — their fader gains are untouched so music or narration stays constant
through the transition (reference 12). The lever value comes from the same transition source that
drives the video Mix/Wipe (ADR-0012), whether moved by hand or by Auto Take, so audio and video
crossfade together. When Audio Follow is off, the A/B fader gains return to their manual values.

**Fade stage (reference 11).** The fade stage is a single gain on the master path, automated with
sample-accurate `AudioParam` ramps. Manual fades map the Fade lever to the gain; Auto Fade uses
`setTargetAtTime`/`linearRampToValueAtTime` over the TRANSITION time (0–510 frames), and an
Auto-Fade pause simply cancels scheduled ramps at the current value and resumes from there. The
Audio enable button (reference 11) gates whether the fade stage automates at all; if Audio fade is
disabled the stage gain stays at unity while video/DSK fade independently. Target-dependent
behaviour is honoured exactly:

- **Fade to Matte / White / Black** silences program audio (the fade stage ramps to zero), because
  those targets carry no source audio (reference 11).
- **Fade to A or B** does *not* silence: the fade stage stays open and the fade instead crossfades
  the bus routing so the surviving bus's audio (plus Aux 1/2, which persist unless also faded)
  keeps playing (reference 11). "Fade everything to B" thus melts to clean B audio, not silence.

**Headphone monitoring never fades (reference 2, 11).** A dedicated monitor tap is connected at the
Master fader output — *upstream* of the fade stage — into its own headphone gain node (the
headphone level control). Because the tap precedes the fade stage, no fade target or Auto Fade ever
attenuates the monitor path. In the browser this is one output destination; where the platform
allows output-device selection (`setSinkId`), the monitor gain can address a separate device.

**A/V Synchro (reference 8.9).** A/V Synchro reads an audio envelope and emits trigger events that
gate video digital effects; it produces no audio of its own. An `AnalyserNode` (or the optional
envelope-follower `AudioWorkletNode` for a faster attack) tapped on the incoming programme audio
yields a running envelope. The **LEVEL control is the threshold**: toward MAX only loud peaks cross
it, toward MIN quiet sounds also cross (reference 8.9). Crossing the threshold sets a "triggered"
flag; the audio engine emits this as an event/observable into the panel state, and the video effect
layer holds the selected effect (any combination of Nega, Mosaic, Mono, Paint, Still, or Strobe)
while the flag is set. For Nega/Mosaic/Mono/Paint/Still the effect holds for as long as the audio
stays above threshold; for Strobe the hold is instead governed by the Effect Interval Timer, so the
trigger only re-arms the strobe rather than gating its whole duration (reference 8.9). A/V Synchro
cannot combine with Trail (reference 8.8); that exclusion is enforced in the video effect controller
(ADR-0007 (GPU frame memory for freeze-family effects)), and the audio engine simply keeps emitting
its envelope regardless.

The audio graph is static in topology; runtime changes are limited to gain values, the small set of
(re)connections for bus assignment / Mic-Aux2 / Program Out mode, and scheduled fade ramps.

### Consequences

**Good**

- The audio graph is a direct transcription of the hardware Audio Mix block diagram, so
  audio-mixer, audio-follow, and fade-control behaviour is easy to reason about and review.
- Gain automation, smoothing, and metering are native and run on the audio thread, fully decoupled
  from the WebGPU render loop (ADR-0012) — audio stays glitch-free under video load.
- Fade target semantics and the headphone-never-fades rule fall out of graph *topology* (tap
  placement, ramp targets) rather than special-case code.
- Audio Follow and video Mix/Wipe read the same lever source, so they cannot drift apart.
- No audio dependency, consistent with ADR-0003; gain and trigger math are unit-testable.

**Bad**

- Autoplay policy forces a first-gesture `resume()`; the UI must own an explicit "enable audio"
  moment.
- `AnalyserNode` metering is RMS/peak, not a true fast envelope; A/V Synchro may require the optional
  `AudioWorkletNode` follower to feel tight to the beat, adding one worklet to build.
- Sources without audio (Matte, silent video, image, canvas) must be handled as legitimate silence so
  meters and triggers read zero rather than erroring.

**Neutral**

- The Mic/Aux2 switch and Program Out audio mode are modelled as re-connections; a few edges change at
  runtime, but the node set is fixed.
- A/V Synchro's trigger is emitted into panel state (ADR-0011) and consumed by the video effect layer,
  keeping the audio engine free of video-effect logic.

## More Information

- Reference: sections 5 (Audio Mixer), 11 (Fade Control — audio fade nuances), 12 (Audio Follow),
  8.9 (A/V Synchro), plus 2 (Program Out audio, headphone jack) and 3 (source selects its audio).
- ADR-0003 (Vanilla TypeScript with banira and no UI framework) — no audio library.
- ADR-0006 (Two-bus source model and Matte substitution rules) — Program Out audio reshaping; Matte silence.
- ADR-0007 (GPU frame memory for freeze-family effects) — A/V Synchro / Trail exclusion; effect gating.
- ADR-0008 (Uniform input-source abstraction) — where per-source audio streams originate.
- ADR-0011 (Single unidirectional panel state store) — faders, follow/fade enables, and trigger events.
- ADR-0012 (Render loop and transition timing model) — shared lever/transition clock for Audio Follow and Auto Fade.
- ADR-0016 (Testing strategy) — unit tests for gain curves, crossfade power, and threshold triggering.
- Features: audio-mixer.feature, audio-follow.feature, fade-control.feature, av-synchro.feature,
  program-output.feature.
