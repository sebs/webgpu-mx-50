# ADR-0015: Persistence for Event Memory and settings

- Status: Accepted
- Date: 2026-07-24
- Deciders: project owner

## Context and Problem Statement

The WJ-MX50 keeps state across power cycles in two distinct ways (reference
sections 13 and 18):

- **Event Memory (reference 13):** 8 slots, each a *complete panel snapshot* —
  source assignments, effects, wipe/mix setup, key setup, matte colour, and so
  on. Slots are stored, recalled, sequenced (Auto Take walks them in numerical
  order, skipping empty slots), and mass-cleared. On the hardware these are
  battery-backed and survive only a few days without AC power.
- **Housekeeping / power-up behaviour (reference 18):** a rear **Reset ON/OFF**
  switch chooses between two power-up policies. **Reset ON** returns the unit to
  the factory preset on every power-up. **Reset OFF** ("field preset") restores
  the panel state as it was at power-off — *except* Still, Strobe, and Special
  functions, which are never restored. General button modes are held about a
  week without AC power.

We need a browser persistence design that reproduces both behaviours faithfully,
serialises the same state the render loop actually reads, and gives the user an
escape hatch the hardware never had: portable presets. The core object being
persisted is the panel state store defined in
ADR-0011 (Single unidirectional panel state store) — Event Memory slots are just
frozen copies of (a subset of) that store, and field-preset restore is that same
store rehydrated at boot.

Two wrinkles distinguish this from "just call `JSON.stringify(store)`":

1. **Snapshots may grow.** A bare panel snapshot is small (a few kilobytes of
   scalars and enums). But some recipes let the user store *captured pixels* —
   e.g. a Scene Grabber still or a picture-in-picture freeze
   (reference 16). If we ever persist captured stills alongside a slot, a slot
   stops being a few kilobytes and becomes megabytes of image data, which does
   not belong in `localStorage`.
2. **Some state must not survive a reload.** The reference is explicit that Still,
   Strobe, and Special modes are excluded from field-preset restore
   (reference 18). Our persistence layer must model that exclusion as a first-class
   rule, not leak it through by serialising the whole store blindly.

The open question is which browser storage primitives to use, how to partition
state between them, and how to encode the two hardware power-up policies.

## Decision Drivers

- Fidelity to reference 13 (8 slots, sequencing, mass-clear, snapshot semantics)
  and reference 18 (Reset ON vs. field preset; Still/Strobe/Special not restored).
- Serialise exactly the panel store of
  ADR-0011 (Single unidirectional panel state store), so persistence never drifts
  from live state.
- Right-sized storage: small scalar state in a synchronous, simple store; large
  binary blobs (captured stills) in a store built for them.
- A portability feature the hardware lacked: human-readable JSON preset
  import/export, so users can share and version panel setups.
- Schema evolution: stored data outlives code; reads must tolerate old versions.
- Testability against the domain specs
  (ADR-0016 (Testing strategy)) — event-memory.feature and auto-take.feature.
- No servers. Everything is local to the browser; no account, no network round-trip.

## Considered Options

### Option A — Everything in `localStorage`

Serialise the whole store, all 8 slots, and settings to `localStorage` keys.

- Good: trivially simple; synchronous; no async plumbing at boot.
- Bad: `localStorage` is ~5 MB, string-only, and synchronous on the main thread.
  A single Scene Grabber still (a full-res RGBA frame) can blow the whole quota,
  and base64-encoding image data into a synchronous store janks the render loop.
  No room to grow. Rejected as the *sole* store.

### Option B — Everything in IndexedDB

Put slots, settings, and blobs all in IndexedDB.

- Good: large capacity; stores `Blob`/`ArrayBuffer` natively; asynchronous.
- Bad: async-only makes the boot path (field-preset restore before first paint)
  clumsier than it needs to be for a few kilobytes of scalars; verbose API for
  small settings that change constantly. Overkill for the common case. Rejected
  as the *sole* store.

### Option C (chosen) — Tiered storage: `localStorage` for small state, IndexedDB for blobs, JSON files for portability

Partition by size and access pattern:

- **`localStorage`** holds the small, hot, synchronous state: app settings, the
  Reset ON/OFF policy flag, the field-preset snapshot, and the *metadata* of each
  of the 8 Event Memory slots (the panel snapshot itself, minus any heavy pixel
  payload). All JSON, all a few kilobytes, readable synchronously at boot.
- **IndexedDB** holds only heavy binary payloads — captured stills attached to a
  slot (Scene Grabber / PiP freezes) — keyed by slot id, loaded lazily when a slot
  that references a still is recalled.
- **JSON files** are the portability layer: import/export of presets and full slot
  banks as plain, human-readable, versioned JSON that the user downloads or uploads.

- Good: each concern uses the store built for it; boot stays synchronous and fast;
  blobs never threaten the scalar quota; presets are portable and diff-friendly;
  the design scales from "no stills stored" (IndexedDB stays empty) to "several
  stills" without changing the small-state path.
- Bad: two storage backends plus a file codec is more moving parts than a single
  store; a slot with a still spans both backends and must stay referentially
  consistent (write blob first, then commit the referencing snapshot).
- Neutral: introduces a thin persistence module that the store subscribes to,
  rather than the store touching Web APIs directly.

## Decision Outcome

Chosen option: **C — tiered storage**. A single **persistence module** owns all
browser-storage access; the rest of the app never touches `localStorage`,
IndexedDB, or the File APIs directly. It exposes: `saveSettings`, `saveSlot(n)`,
`recallSlot(n)`, `clearAllSlots`, `captureFieldPreset`, `restoreOnBoot`,
`exportPreset`, and `importPreset`.

**What gets serialised.** The unit of persistence is a **panel snapshot**: a
plain-data projection of the ADR-0011 store containing the persistable panel
state (source/bus assignment, colour correction, digital-effect *selection*,
wipe/mix setup, key setup, DSK setup, matte colour, fade enables, audio mixer
levels). It is derived by the store, not scraped from the DOM, so persisted state
and live state are the same source of truth. Volatile, non-persistable runtime
state (GPU textures, the freeze/ring/ping-pong frame memory of
ADR-0007 (GPU frame memory for freeze-family effects), transition progress,
timers) is explicitly excluded from the snapshot.

**Event Memory (reference 13).**

- **8 slots.** `saveSlot(n)` writes the current panel snapshot to slot `n`
  (1–8). If the current setup includes a captured still that the user chose to
  store (Scene Grabber / PiP freeze), the still's pixels are written to IndexedDB
  under the slot key *first*, then the snapshot — carrying only a still-reference
  id — is committed to `localStorage`, keeping the two backends consistent.
- **Recall.** `recallSlot(n)` rehydrates the store from the slot snapshot; if the
  snapshot references a still, the blob is loaded from IndexedDB and re-uploaded to
  a GPU texture. Recall dispatches through the normal store update path
  (ADR-0011) so the UI and render loop react identically to a manual change.
- **Empty-slot semantics & sequencing.** Slots are individually
  present-or-empty. Auto Take's sequential playback (reference 13, and
  ADR-0012 (Render loop and transition timing model)) steps in numerical order and
  **skips empty slots**; the persistence module exposes the set of occupied slots
  so auto-take.feature's sequencing has a single authority.
- **Mass-clear.** `clearAllSlots` models the hardware's power-off +
  MEMORY+SHIFT-on-power-up clear (reference 13): it wipes all 8 slot snapshots from
  `localStorage` and their still blobs from IndexedDB. Exposed as an explicit UI
  action (the browser has no power switch).
- **No battery decay.** The hardware's few-days battery limit (reference 13) is a
  physical constraint with no browser analogue; stored slots persist until the user
  clears them or clears site data. We deliberately do **not** emulate expiry.

**Power-up policy (reference 18).** A persisted **Reset policy** flag models the
rear Reset ON/OFF switch, surfaced as a settings toggle:

- **Reset ON (default, matches hardware recommendation).** On boot, ignore any
  saved field preset and initialise the store to the **factory preset** — a known,
  version-controlled default snapshot. Guards against booting into a weird state.
- **Reset OFF (field preset).** On every meaningful state change the module
  debounces a `captureFieldPreset` that writes the current snapshot to a dedicated
  `localStorage` key. On boot, `restoreOnBoot` rehydrates the store from that
  snapshot **with the non-restored fields stripped**.

**Non-restored state (reference 18).** Field-preset restore must *not* bring back
**Still, Strobe, or Special modes**. This is enforced in one place: a
`FIELD_PRESET_OMIT` filter applied when writing the field preset (or when reading
it, belt-and-braces), which drops the Still/Strobe engagement flags and any
Special Mode selection, so the restored panel comes up with those effects off even
if they were active at "power-off". The same filter documents, in code, exactly
what the reference excludes. (Event Memory slots follow the hardware too: a stored
slot is a full setup, but recalling one does not resurrect a live Still/Strobe
capture — the freeze frame memory of ADR-0007 is runtime-only and is not
serialised.)

**Portable presets (a capability the hardware lacked).**

- `exportPreset` writes a single slot, the whole 8-slot bank, or the settings as a
  downloadable **versioned JSON** file — human-readable and diff-friendly. Stills,
  if present, are inlined as base64 data or omitted by user choice, so a preset file
  is self-contained.
- `importPreset` validates and loads such a file back into slots or settings.
- Both go through the same snapshot schema and version tag as the internal stores,
  so there is exactly one serialisation format.

**Schema versioning.** Every persisted object (settings, each slot, the field
preset, exported files) carries a `schemaVersion`. Reads run through a migration
step that upgrades older payloads to the current shape; unrecognised or corrupt
payloads are discarded and treated as "empty", never crashing the boot path. The
factory-preset snapshot is the fallback whenever restore fails.

### Consequences

**Good**

- Storage is right-sized: synchronous scalar state loads before first paint;
  heavy stills live in a store designed for blobs and load lazily.
- Reset ON / field-preset and the Still/Strobe/Special exclusion are modelled
  explicitly, in one filter, so they cannot silently drift from reference 18.
- Persisted state *is* the ADR-0011 store projection, so live and saved state can
  never diverge into two representations.
- JSON import/export gives users versionable, shareable presets the hardware never
  offered, at no extra serialisation format.
- All storage access is behind one module, keeping Web-storage APIs out of the UI
  and render code and giving event-memory.feature / auto-take.feature a single
  seam to test against.
- Schema versioning + factory-preset fallback makes stored data forward-safe and
  the boot path crash-proof.

**Bad**

- Two storage backends plus a file codec is more surface area than a single store;
  a slot that spans `localStorage` (snapshot) and IndexedDB (still) must maintain
  referential consistency across an async boundary.
- Field-preset capture needs debouncing to avoid thrashing `localStorage` on every
  fader tick.

**Neutral**

- The hardware's battery/backup decay (reference 13, 18) is intentionally *not*
  emulated; stored state persists until explicitly cleared or the user clears site
  data.
- The factory preset is a maintained artifact that must be kept in step with the
  store's schema and sensible defaults.
- Persistence is passive: it subscribes to the store and never drives the render
  loop, preserving the store's unidirectional flow (ADR-0011) and the render loop's
  independence from UI concerns.

## More Information

- Reference: section 13 (Event Memory — 8 slots, store/recall/sequence/clear,
  battery backup), section 18 (System & Housekeeping — Reset ON/OFF, field preset,
  Still/Strobe/Special not restored, ~1 week memory backup); section 16
  (Combination Recipes — Scene Grabber / PiP stills that a slot may capture).
- ADR-0011 (Single unidirectional panel state store) — the store this module
  serialises and rehydrates.
- ADR-0007 (GPU frame memory for freeze-family effects) — the runtime freeze/ring
  frame memory that is deliberately *not* persisted.
- ADR-0012 (Render loop and transition timing model) — Auto Take sequential
  playback that consumes the occupied-slot set.
- ADR-0006 (Two-bus source model and Matte substitution rules) — bus/source and
  matte state carried in a snapshot.
- ADR-0016 (Testing strategy) — Gherkin coverage of persistence behaviour.
- Features: event-memory.feature, auto-take.feature, special-modes.feature,
  position-and-scene-grabber.feature, inputs-and-devices.feature.
