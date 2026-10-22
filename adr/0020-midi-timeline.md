# ADR-0020: MIDI timeline — scrubbable demo automation on the MIDI control path

- Status: Accepted
- Date: 2026-10-23
- Deciders: project owner

## Context and Problem Statement

The site's demos automate the mixer from code. Attract mode (D1) ran five acts on a
`setInterval`, each calling the automation API and firing Auto Take. That works, but it is
a black box: it cannot be paused at a frame, scrubbed, stepped, shown, exported to a DAW,
or recorded over. The owner wants certain aspects of certain demos automated on a
**scrubbable timeline**, and wants that timeline to be **MIDI**, so the same material can
come from or go to Ableton (ADR-0018 already makes the DAW a first-class surface).

Two things must be decided: what a timeline is made of, and how "the panel at frame f" is
produced on demand without breaking the clock (ADR-0012) or the single write path
(ADR-0011, ADR-0014).

## Decision Drivers

- No second command path: everything reaches the store through the binding table, the
  coalescer and the one resolver (ADR-0014/0018).
- The host clock is sovereign and never jumps (ADR-0012); a seek must not rewind it.
- Scrubbing must be exact: playing to frame f and seeking to frame f give the same panel,
  at any display cadence — the same promise D10 makes for the clock.
- What a DAW can send, a timeline can hold, and the other way round (Standard MIDI Files,
  live recording, transport sync).
- DOM-free and headless-testable, like the rest of the control layer (ADR-0016).

## Considered Options

### Option A — A keyframed timeline over store commands

Lanes of `Command`s, with interpolation for numeric fields.

- Good: anything the store can do is automatable.
- Bad: a second automation vocabulary next to MIDI; nothing a DAW could play or record;
  numeric interpolation would have to know every command's payload. **Rejected.**

### Option B — A MIDI timeline played into the existing MIDI adapter (chosen)

Lanes of MIDI messages in frames, compiled to bytes and pushed through `MidiAdapter.handle()`
(already port-free) under a binding profile. Scrubbing replays the bytes.

- Good: one path; the published Ableton profile is the timeline's vocabulary; SMF import and
  export and live recording are byte-level and therefore exact.
- Neutral: only what the logical vocabulary reaches is automatable — whole setups go through
  Event Memory presets, which is how a DAW changes scenes anyway.
- Bad: the coalescer's ordering rules (pulses before sets) and the Event Memory armed-next
  pointer become authoring rules; they are validated, not hidden.

### Option C — Record the store's commands and replay them

- Good: trivially exact.
- Bad: not authorable, not MIDI, ties files to the command union's shape. **Rejected.**

## Decision Outcome

Chosen option: **B — a MIDI timeline on the ADR-0014/0018 path, scrubbed by replay.**

### The format (`src/control/midi-timeline.ts`)

A `MidiTimeline` is JSON with a schema version: `length` in frames (60 per second, one tick
each), `loop`, `bpm` (for SMF export and transport sync; 120 puts a quarter on 30 frames),
an optional `profile` (default `ABLETON_PROFILE`), `markers`, `setups` and `lanes`:

| Lane | MIDI | What it does |
| --- | --- | --- |
| `pc` | Program Change | recalls a setup — store commands applied to the factory panel, stored in an Event Memory slot of the timeline's base panel |
| `note` | Note On | discrete controls: wipe pattern notes 24–51, Auto Fade, sources, … |
| `cc` | Control Change | breakpoint envelope (`linear` / `hold` / `ease`), silent before its first point, sampled per tick, sent only on change; MSB/LSB pairs when `fine` |

Compilation orders a frame as setups → notes → motion, so a CC lands on the panel a PC just
recalled.

### Replay and the frame contract

`playFrame` is the one per-frame contract, shared by replay and live play: push the frame's
bytes into the adapter, `ADVANCE_TIMELINE` to the previous tick, flush the coalescer at this
tick, advance to it — exactly what a host's `beforeFrame` hook plus its loop do. Frames with
no messages are skipped: runners are absolute in ticks, so a later advance lands the same.

`TimelineReplay.stateAt(f)` folds the frames up to f over the base panel in **timeline
ticks** (frame f = tick f), with an immutable checkpoint every 60 frames. A host loads the
result shifted into its own ticks by `shiftRunnerTicks` — the transition, fade and Special
Mode runners are the only state holding absolute ticks — so one cache serves every anchor.

### The player (`src/control/timeline-player.ts`)

A composition-root tool on the host's `beforeFrame` hook (not in the mixer context, ADR-0017).
The playhead is `tick − anchor`; the host clock never moves for it. Playing processes every
frame the host stepped past through `playFrame`; seeking and loop wrap re-anchor and
`LOAD_STATE` the replayed panel. While paused the anchor slides with the clock, and the panel
is reloaded only while the *timeline's* panel has a runner in flight — a paused Auto Fade
holds, but a visitor's own take on a paused, settled panel is theirs.

`<mx-mixer>` gains one embedder member, `feedTick`, so the `feeds="pattern"` pictures follow
the playhead; input hooks now run before the feeds draw, so a seek moves the picture in the
same frame.

### Live MIDI: thru, recording, transport

`player.input(bytes)` monitors live MIDI through the timeline's profile, buffered to the next
frame and pushed after the timeline's own messages so a hand on a controller wins the frame.
A punch-in take (`record()` / `stopRecording()`) replaces only the lanes it touched, only
inside the punch range, keeping CC envelopes continuous at both seams; touched lanes are muted
in playback while recording. Fineness comes from the profile binding, so a 7-bit controller
on a 14-bit binding records what the adapter heard. With `setFollow(true)`, MIDI transport —
Start, Stop, Continue, Song Position Pointer, Timing Clock — moves the playhead (a DAW as
transport master), wrapping on a looping timeline. System messages never reach bindings.

### Standard MIDI Files (`src/control/smf.ts`)

Export writes the compiled stream as format 0 at 480 PPQ with tempo, title and markers, and a
Note Off one frame after each Note On; at 120 bpm a frame is exactly 16 ticks, so a round trip
is lossless. Import reads format 0/1, running status, tempo maps and SMPTE division, and is
imported *into* a timeline: setups, loop and profile are kept, lanes and markers come from the
file.

### Authoring rules, enforced by `validateTimeline`

- A trigger/toggle note in the same frame as a Program Change resolves before the recall (the
  coalescer flushes pulses first) and is undone by it — move it a frame later.
- An Auto Take after a recall recalls the *next* slot (ADR-0018 armed-next pointer), so takes
  are automated on the lever lane (CC1, 14-bit). Auto Fade ignores the bank.
- CC lanes must hit absolute (`set`) bindings with matching fineness; relative encoders cannot
  be scrubbed.

`scripts/site-data.ts` fails the build on an invalid site timeline and publishes each as
`.json` and `.mid`.

### Consequences

**Good**

- Attract mode is now data (`site/timelines.ts`) and is the same file a DAW can play; the
  `/architecture/` demo shows it with transport, lanes, scrubber, import/export, record and follow.
- Scrubbing is exact by construction and pinned by a test that plays at uneven cadences and
  compares every frame with the replay.
- No new command, no new store state; the player is a client of the existing path.

**Bad**

- Not everything scrubs: GPU frame memory (Still/Strobe/Multi/Trail history) rebuilds after a
  seek, audio is not scrubbed, and live camera/video sources run on.
- A seek is a `LOAD_STATE`, so subscribers see a whole-panel change per scrub frame.
- Authoring must respect the two ordering rules above (validated, but still rules).

**Neutral**

- What a timeline can automate grows with the ADR-0014 vocabulary; a control without a logical
  id is reached through a setup until it gets one.
- The attract loop's acts start with a recall, so each act begins on its preset rather than on
  whatever the previous act left — the loop is the same every time.

## More Information

- ADR-0011 (State store), ADR-0012 (Render loop and timing) — the purity and the absolute
  runner ticks replay relies on.
- ADR-0014 (Control input mapping), ADR-0018 (MIDI control surface) — the path and the profile.
- ADR-0017 (Composable embedding) — why the player is a composition-root tool.
- Reference: docs/wj-mx50-feature-reference.md §13 (Event Memory), §15 (Auto Take), §17 (GPI /
  editor control).
