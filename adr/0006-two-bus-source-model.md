# ADR-0006: Two-bus source model and Matte substitution rules

- Status: Accepted
- Date: 2026-07-24
- Deciders: project owner

## Context and Problem Statement

The WJ-MX50 organises all video processing around **two independent buses**,
A-bus and B-bus. Each bus selects exactly one of five inputs — **Source 1**,
**Source 2**, **Source 3**, **Source 4**, or the internal **Matte** — and that
selection drives both the video *and* the audio for that bus (reference §3).
The two buses feed the Mix/Wipe stage, which composites them into the effect
path defined in the signal flow (Source -> bus assignment -> Colour Correction
-> Digital Effect -> Mix/Wipe -> DSK -> Fade -> Program Out).

The Matte is not a fully general source. The hardware permits Matte as a bus
source for **Wipe, Mix, and NAM**, but forbids it wherever the downstream stage
needs real picture content to key or fade against: **Luminance Key, Chroma Key,
Downstream Key, and Fade Control** (reference §3, §4). In those cases the unit
does not error and does not show black — it **automatically substitutes the
video of the "blinking" source button**. The same substitution governs the
direct Program Out case: pressing a bus's direct-out button (A or B) while that
bus holds Matte cannot output the Matte, so the unit outputs the blinking
source instead (reference §2, "Program Out Selection").

We need a single, authoritative domain model for what a bus holds, how audio
follows video selection, and how Matte substitution is resolved — so that every
downstream feature (keys, DSK, fade, program out) reads the *effective* source
consistently rather than each re-deriving the rule. This ADR fixes that model.

## Decision Drivers

- **Fidelity to hardware semantics.** Matte-allowed vs. Matte-forbidden stages,
  and the substitution behaviour, must match §3/§4 exactly — no invented errors,
  no silent black frames.
- **Single source of truth.** The substitution rule must live in one place so
  keys, DSK, fade, and program-out never disagree about what a bus resolves to.
- **Audio-follows-video coupling.** Selecting a source selects its audio (§3,
  §5); the model must express this without duplicating audio routing logic that
  belongs to ADR-0010 (Audio engine on the Web Audio API).
- **Clean-modern representation.** Consistent with ADR-0005 (Clean-modern RGBA
  video representation), a bus resolves to a linear-RGBA texture; Matte is just
  another producer of that texture, not a special analog path.
- **Testability.** The rule set must be expressible as declarative domain
  scenarios (source-selection.feature) and unit-testable without the GPU.

## Considered Options

### Option A — Bus holds a raw `selection` enum; each consumer applies the Matte rule itself

Each stage (LumaKey, ChromaKey, DSK, Fade, ProgramOut) inspects the bus's
`selection` and independently decides whether to substitute the blinking source.

- Good: no shared abstraction to design up front.
- Bad: the substitution rule is duplicated across five call sites; drift is
  almost guaranteed, and it contradicts the "single source of truth" driver.
- Bad: "which button is blinking" logic gets re-implemented per consumer.

### Option B — Bus exposes a resolver: `selection` plus an `effectiveSource(context)` accessor

The bus stores the raw `selection` (Source 1-4 | Matte) and the blinking-source
pointer. A single resolver answers "what texture does this bus provide *for a
given consumer context*?" — where context is one of `mixWipe`, `key`, `dsk`,
`fade`, or `directOut`. For `mixWipe` the resolver returns Matte when selected;
for the others it returns the blinking source's video when Matte is selected.

- Good: one implementation of the rule; consumers ask, they do not decide.
- Good: matches the hardware's "the unit substitutes" framing directly.
- Neutral: introduces a small context enum every consumer must pass.

### Option C — Eagerly rewrite the selection to the blinking source when a forbidden stage is engaged

When a key/DSK/fade is enabled on a Matte-holding bus, mutate the bus selection
to the blinking source.

- Good: consumers see a plain source, no context needed.
- Bad: destroys the user's actual selection; toggling the key off would have to
  restore Matte, requiring hidden shadow state — fragile and surprising.
- Bad: the UI must still show Matte as selected while the key uses a substitute,
  so state and display diverge anyway.

## Decision Outcome

Chosen option: **Option B — a bus resolver with a per-consumer context.**

The panel state store (ADR-0011, Single unidirectional panel state store) holds,
per bus:

- `selection`: `Source1 | Source2 | Source3 | Source4 | Matte`.
- The resolver is a pure function `resolveBusSource(bus, context)` where
  `context ∈ { mixWipe, key, dsk, fade, directOut }`.

Resolution rules (authoritative, from §3/§4/§2):

1. **Non-Matte selection:** the resolver always returns that source's video,
   for every context.
2. **Matte selection + `mixWipe` context:** the resolver returns the Matte
   texture. Matte is a legal participant in Wipe, Mix, and NAM.
3. **Matte selection + `key` / `dsk` / `fade` / `directOut` context:** the
   resolver returns the **blinking source's** video (the substitute). Matte is
   never sampled for luminance/chroma keying, DSK fill/source, fade target, or
   direct program output.

**The blinking source.** The "blinking source button" is the substitute the unit
falls back to when Matte is illegal. We model it as an explicit per-bus field
`substituteSource: Source1..4` — the last non-Matte source the bus held, defaulting
to Source 1 if the bus has only ever held Matte. The UI renders this button with a
blinking state (ADR-0013, Hybrid panel-layout UI) so the user can see which real
picture will stand in for the Matte. Because it is stored, not derived on the fly,
the substitute is stable and predictable across stage toggles.

**Audio follows video.** Selecting a source on a bus selects that source's audio,
routed to the A-bus or B-bus fader (§3, §5). The store emits the selection; the
audio engine (ADR-0010) subscribes and routes the corresponding input to the bus
fader. Selecting **Matte** yields no bus audio (there is no audio to follow),
though the Aux/Mic faders are unaffected. This ADR owns the *coupling rule*
(video selection determines audio routing); ADR-0010 owns the routing mechanism.

**Matte producer.** Matte is one uniform input among many per ADR-0008 (Uniform
input-source abstraction): it produces a linear-RGBA texture from the 9-colour
generator (matte-generator.feature). The two-bus model treats Matte as a normal
texture producer that happens to be restricted by the resolver contexts above —
the restriction lives in the resolver, not in the Matte producer.

**Program Out interaction.** Program output selection (program-output.feature,
§2) uses the resolver with `directOut` context for the A and B buttons. Thus a
direct-out of a Matte-holding bus yields the blinking substitute, never Matte;
the EFFECT button uses the full processed composite and is unaffected by this
rule. This keeps §2's "the Matte can't be output" behaviour in one place.

### Consequences

**Good**
- One implementation of the Matte substitution rule; keys, DSK, fade, and
  program out all consume it identically. No cross-stage drift.
- The user's real selection (Matte) is preserved in state even while a forbidden
  stage silently substitutes — state and UI stay truthful (§4 display of the
  current Matte colour remains valid).
- Audio-follows-video is expressed as a coupling rule with a clear owner boundary
  against ADR-0010.
- The rule set is directly expressible as Gherkin scenarios and unit tests with
  no GPU dependency (ADR-0016, Testing strategy).

**Bad**
- Every consumer must pass the correct context enum; a miscategorised stage would
  apply the wrong rule. Mitigated by centralising the context values and covering
  each in source-selection.feature.
- Storing `substituteSource` adds a small piece of per-bus state that must be
  kept in sync when the selection changes.

**Neutral**
- The resolver is pure and synchronous; it holds no textures itself, only the
  selection and substitute pointer, deferring actual texture handles to the input
  abstraction (ADR-0008).
- Frame field/frame mode (frame-field-mode.feature) is deferred per ADR-0005 and
  does not interact with this model.

## More Information

- Reference: §2 Inputs & Outputs (Program Out Selection — direct-out Matte case);
  §3 Source Selection (B-1); §4 Matte Generator (B-2).
- Related ADRs: ADR-0004 (Explicit signal-graph pipeline mirroring the hardware
  flow), ADR-0005 (Clean-modern RGBA video representation; defer analog
  emulation), ADR-0008 (Uniform input-source abstraction), ADR-0010 (Audio engine
  on the Web Audio API), ADR-0011 (Single unidirectional panel state store),
  ADR-0013 (Hybrid panel-layout UI on Web Components), ADR-0016 (Testing strategy).
- Related features: source-selection.feature, matte-generator.feature,
  program-output.feature, audio-mixer.feature, luminance-key.feature,
  chroma-key.feature, downstream-key.feature, fade-control.feature,
  transition-mix-nam.feature, wipe-patterns.feature.
