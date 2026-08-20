# ADR-0018: MIDI control surface — DAW profile, preset recall, MIDI learn, MPE outlook

- Status: Accepted
- Date: 2026-08-19
- Deciders: project owner

## Context and Problem Statement

The control-input mapping layer (ADR-0014) already treats MIDI as one of its surfaces:
`src/control/midi.ts` routes Note On to discrete controls and Control Change to
continuous ones, through the binding table (`midi:note/<ch>/<n>`, `midi:cc/<ch>/<cc>`
addresses), the signal coalescer, and the one resolver that turns signals into store
commands. What exists is plumbing; what is missing is a *usable instrument*:

1. **A DAW as a controller.** The owner wants Ableton Live to drive aspects of the
   mixer — automation lanes on the lever and faders, scene-launch preset changes.
   Ableton reaches Web MIDI through a virtual port (IAC on macOS) with no bridge, but
   today there is no stable, documented mapping to target, and 7-bit CC quantises a
   slow automated wipe into visible steps.
2. **Presets over MIDI.** The Event Memory bank (reference §13, ADR-0015) is the
   preset system, but none of its verbs are in the remappable logical-control
   vocabulary, so no external surface can store or recall.
3. **MIDI learn.** A hardware controller should be mappable by touching, not by
   editing JSON.
4. **MPE.** The owner asks what MIDI Polyphonic Expression can contribute.

## Decision Drivers

- Every surface converges on ADR-0014's one vocabulary and one resolver; MIDI must
  add *addresses and controls*, never a second command path.
- The coalescer already collapses dense input to one command per logical tick
  (ADR-0012); a DAW may spray CCs at wire speed and must not need throttling.
- Bindings are DATA and persist under their own key (ADR-0014/0015); learn must reuse
  that, not invent parallel storage.
- Continuous video parameters (lever, fade, positioner) need more than 128 steps.
- Recall must serve both natures of the instrument: the hardware ritual (arm a slot,
  AUTO TAKE runs it, reference §13) and the DAW's "land the preset on this beat".
- Web MIDI delivers raw bytes; anything above running-status parsing (14-bit pairs,
  MPE zones) is ours to implement and must stay inside the MIDI adapter.

## Considered Options

### Option A — A dedicated "Ableton bridge" outside the mapping layer

A bespoke module translating a fixed Ableton template directly into store commands.

- Good: quickest demo.
- Bad: a second command path bypassing the binding table — unmappable, unlearnable,
  violates ADR-0014's single-vocabulary rule. **Rejected.**

### Option B — Extend the ADR-0014 vocabulary and the MIDI adapter (chosen)

Memory verbs become logical controls; Program Change becomes an address kind; 14-bit
CC pairing and learn capture live inside the adapter; a published profile is just a
named binding bank.

- Good: everything stays remappable, persistable, and surface-agnostic — a learned
  knob, an Ableton lane, and a keyboard key remain three views of one action.
- Neutral: the vocabulary grows by three members and the resolver by three cases —
  the exact extension recipe ADR-0014 documents.
- Bad: none identified beyond adapter complexity (pairing, learn state).

### Option C — MPE-first performance instrument

Build the MPE gesture layer as the primary MIDI surface.

- Good: uniquely expressive (per-finger three-axis control).
- Bad: a channel-rotation state machine before basic DAW control exists; hard-coded
  gestures without learn/profiles to map them. **Deferred, not rejected** — see the
  outlook below; it layers cleanly on top of this ADR once learn exists.

## Decision Outcome

Chosen option: **B — extend the vocabulary, the addressing, and the adapter; ship a
DAW profile as a binding bank; add learn; keep MPE as a layered outlook.**

### Vocabulary: memory verbs (reference §13)

Three new `LogicalControlId` members, three resolver cases:

- `memory.storeArm` — mode `trigger` → `PRESS_MEMORY` (latch store mode).
- `memory.slot` — mode `set`, value 1–8 → `PRESS_EVENT_NO` (the hardware ritual:
  store when MEMORY is latched, else arm; AUTO TAKE runs the recall).
- `memory.recall` — mode `set`, value 1–8 → a new `RECALL_EVENT` command: an
  **immediate** recall that loads the slot and advances the armed-next pointer
  exactly as an AUTO-TAKE-run recall would (event-memory sequential-playback rule).
  **Decision of record: immediate recall is legal while a slot is armed** — the two
  recall flavours coexist; an armed slot never blocks `RECALL_EVENT`, and the
  armed-next pointer is recomputed from the recalled slot.

### Addressing: Program Change

New address kind `midi:pc/<ch>/<n>`. PC is the idiomatic preset-change message and
Ableton emits it per scene; the ships-with profile maps PC 0–7 → `memory.recall` 1–8.

### The DAW profile

A **named binding bank** (a second `BindingMap` beside `DEFAULT_BINDINGS`, selectable
in the UI and exported/imported like any preset JSON): CC1 lever, CC2 fade lever, CC7
master, CC per audio fader, notes for sources/program-out/Auto Take/Auto Fade, PC for
recall. Published in the docs so an Ableton session template can target it forever.
Profiles are data; switching one never touches code.

### High resolution: 14-bit CC pairs

The adapter recognises the MIDI-spec MSB/LSB convention (CC *n* paired with CC
*n+32*) when a binding opts in (`fine: true` on the binding), assembling a 0–16383
value before normalisation. Applies to lever, fade lever, positioner, and DSK levels.
Pairing state lives entirely inside the MIDI adapter.

### MIDI learn

- A **capture hook** on the adapter: while learn is armed for a target control, the
  next incoming message is delivered to the learn handler (address + payload) instead
  of the coalescer.
- **Classification at capture**: CC → `set` with 0–127 range; a CC stream hovering
  63–65 → relative encoder (`nudge`); an observed *n*/*n+32* pair → 14-bit; note →
  `trigger` or `toggle` per what the target control accepts. Acceptable modes per
  control come from a small static metadata table mirroring the resolver's cases.
- **Persistence is free**: capture ends in `BindingTable.rebind()`, which already
  fires the ADR-0015 save. Unlearn is `unbind()`.
- **UI lives in the connected blocks** (ADR-0017): a global learn toggle puts blocks
  into learn chrome; clicking a control arms it, the next MIDI touch binds it, the
  block badges the bound address.

### MPE outlook (deferred by decision, design fixed)

MPE gives each held note its own channel with 14-bit pitch bend (X), CC74 slide (Y),
and pressure (Z) — per-finger three-axis continuous control, collision-free across
fingers. For this instrument that means **gesture voices**: a bindable profile per
pad, e.g. pad 60 = positioner voice (bend→`positioner.x`, slide→`positioner.y`,
pressure→`lever.position`), pad 61 = key voice (slice/hue/DSK-low). Release velocity
can fire Auto Take — "throwing" a transition. Ableton 11+ MPE clips can automate
several mixer axes from one clip. Implementation is a self-contained `MpeAdapter`
(zone config, member-channel note tracking) emitting `mpe:pad/<n>/<axis>` addresses
into the same binding table. It is built **after** learn and profiles exist, so
gestures are mappable rather than hard-coded.

### Consequences

**Good**

- Ableton (or any DAW/controller) drives the mixer through the same audited path as
  every other surface; automation is tick-coalesced by construction.
- Preset store/recall becomes surface-agnostic vocabulary — GPI, keyboard, and MIDI
  all gain it at once.
- Learn turns the binding table into a self-serve instrument; remaps persist with
  zero new storage.
- The profile-as-data pattern gives stable DAW templates without freezing code.

**Bad**

- The MIDI adapter grows real state (14-bit pairing, learn capture, later MPE
  zones) and stays CI-excluded (Web MIDI needs a browser + gesture); its logic must
  be factored so classification and pairing are pure-testable.
- Two recall flavours must be explained in the UI (armed ritual vs. immediate), since
  both are live at all times by decision of record.

**Neutral**

- `RECALL_EVENT` is a new reducer command with the same semantics as an
  AUTO-TAKE-run recall — one more command, no new state shape.
- PC addressing is MIDI-only vocabulary; other surfaces simply never emit it.

## More Information

- ADR-0014 (Control input mapping layer) — the vocabulary/resolver this extends.
- ADR-0015 (Persistence) — binding-map storage; preset bank this exposes.
- ADR-0017 (Composable embedding) — the connected blocks that host the learn UI.
- ADR-0019 (Content-addressed media store) — the companion decision for preset
  binary content.
- Reference: docs/wj-mx50-feature-reference.md §13 (Event Memory), §17 (GPI).
