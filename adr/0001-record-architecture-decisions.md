# ADR-0001: Record architecture decisions

- Status: Accepted
- Date: 2026-07-24
- Deciders: project owner

## Context and Problem Statement

web-mx-50 recreates the Panasonic WJ-MX50 two-bus digital A/V mixer in the browser
with WebGPU. The build is large and feature-driven: a fixed signal flow (Source ->
bus assignment -> Colour Correction -> Digital Effect -> Mix/Wipe -> Downstream Key
-> Fade -> Program Out), two independent buses, a wipe-pattern engine, a family of
freeze-based digital effects, an audio path, Event Memory, and a hybrid Web-Component
UI. Roughly two dozen Gherkin features and a comparable number of architecture
decisions all trace back to one authoritative source, the feature reference at
`docs/wj-mx50-feature-reference.md`.

Across a build this size, decisions accrete tacitly: a rationale lives in a commit
message, a chat, or one person's memory, and six months later nobody can say why the
video representation is linear-space RGBA, why the wipe engine is compositional, or
why the frame-field button is deferred. When the reasoning is lost, teams re-litigate
settled questions, silently contradict earlier choices, or break an invariant that
was load-bearing for another feature. We need a durable, greppable record of *why*,
sitting next to the code and the features it governs.

The question this ADR settles is not any single technical choice but the meta-choice:
**how do we capture architecture decisions at all?**

## Decision Drivers

- **Traceability**: every non-obvious design choice should be discoverable from a
  stable identifier and cross-linkable to the features and other decisions it affects.
- **Low ceremony**: the format must be lightweight enough that authors reach for it
  instead of routing around it. Heavy process kills the record.
- **Locality**: decisions live in the repository, versioned with the code, reviewable
  in the same pull requests.
- **Stable references**: features and other ADRs must be able to cite a decision by an
  identifier that never changes, even after the decision is revised or reversed.
- **Human- and tool-readable**: plain Markdown, no proprietary tooling, easy to diff
  and easy to search.
- **Immutable history**: superseding a decision must preserve, not erase, the original
  reasoning.

## Considered Options

- **MADR-style Markdown ADRs in the repo.** Markdown Any Decision Records: one file per
  decision, numbered, with a conventional set of sections (context, drivers, options,
  outcome, consequences). Pros: widely understood, minimal ceremony, Git-native,
  greppable, mature template. Cons: light structural enforcement (conventions, not a
  schema); requires discipline to keep cross-references accurate.
- **A single running design document.** One long `DESIGN.md`. Pros: everything in one
  place. Cons: no stable per-decision anchor to cite; merge-conflict magnet; history of
  a specific decision is buried in the file's overall diff; no clear lifecycle per
  decision.
- **Issue-tracker / wiki decisions.** Record decisions as tickets or wiki pages. Pros:
  good discussion threading. Cons: lives outside the repo, not versioned with code, dies
  if the tracker migrates, weak offline and grep story, decisions drift from the code
  they govern.
- **No formal record.** Rely on code comments and memory. Pros: zero overhead up front.
  Cons: rationale evaporates; settled questions get re-opened; the exact failure mode a
  large feature-driven build cannot afford.

## Decision Outcome

Chosen option: **MADR-style Markdown ADRs in the repository.** It is the only option
that satisfies locality, stable references, low ceremony, and immutable history at once,
and its template is familiar enough that it lowers rather than raises the barrier to
writing a decision down.

Concretely, the project adopts the following conventions, and this ADR is the meta-record
that all subsequent ADRs follow.

**Location and numbering.** ADRs live in `adr/` at the repo root, one decision per file,
named `NNNN-kebab-title.md` with a zero-padded four-digit sequence number (`0001`, `0002`,
...). Numbers are assigned in order and are never reused, even after a decision is
superseded. This ADR is `0001`. The number is the decision's permanent identity: features
and other ADRs cite it as `ADR-NNNN (Title)`, and features are cited by filename
(for example `wipe-patterns.feature`).

**Template.** Every ADR opens with a level-1 heading `# ADR-NNNN: Title`, followed by a
metadata block of bullet lines (`Status:`, `Date:`, `Deciders:`), then these sections:

- `## Context and Problem Statement` — the forces and the question, grounded where
  applicable in `docs/wj-mx50-feature-reference.md`.
- `## Decision Drivers` — the criteria the decision is judged against.
- `## Considered Options` — the realistic alternatives, each with brief pros and cons.
- `## Decision Outcome` — names the chosen option, then a `### Consequences` subsection
  with Good / Bad / Neutral bullets.
- `## More Information` — links to related ADRs and the relevant reference section.

Target length is 120 to 220 lines: concrete and decision-oriented, not a tutorial. Every
behavioral claim about the hardware is grounded in the feature reference; ADRs do not
invent mixer behavior.

**Lifecycle.** An ADR's `Status` moves through a small, explicit set of states:

- **Proposed** — drafted and under review; the decision is not yet binding.
- **Accepted** — ratified by the deciders; binding as the plan of record.
- **Superseded by ADR-NNNN** — a later decision has replaced this one. The original file
  is *not* deleted or rewritten; its status line is updated to point forward, and the
  superseding ADR points back. History is preserved so the reasoning behind the reversal
  stays legible.
- **Deprecated** — no longer applies but has no direct replacement (rare).

An accepted ADR is edited only for small corrections; a genuine change of direction is a
*new* ADR that supersedes the old one, never an in-place rewrite of the accepted text.
The four foundational decisions already fixed by the project owner (clean-modern fidelity,
hybrid UI, vanilla-TS/WebGPU/banira stack, planning-artifacts-only scope) are captured as
Accepted ADRs in this series and are not to be contradicted.

**Authoring flow.** New decisions are drafted as `Proposed` in the same pull request as
the work they justify (or ahead of it), reviewed alongside the code and features, and
flipped to `Accepted` on merge. Because ADRs are plain Markdown in the repo, review,
history, blame, and full-text search all come for free from Git.

### Consequences

- **Good**: rationale is durable, versioned with the code, and discoverable by a stable
  identifier; the whole decision set (see the ADR index, `0001`–`0016`) is
  cross-linkable and greppable; onboarding and future-us can reconstruct *why* without
  archaeology; superseding preserves history instead of erasing it.
- **Good**: the low-ceremony Markdown format keeps the cost of recording a decision below
  the cost of skipping it, which is the only way a decision log actually gets maintained.
- **Bad**: conventions are enforced by discipline and review, not by a schema; malformed
  or unlinked ADRs are possible and must be caught in review.
- **Bad**: a modest ongoing cost — each significant decision is one more file to write and
  keep cross-referenced.
- **Neutral**: adopting MADR does not dictate *which* decisions get recorded; the team
  must still judge what rises to the level of an ADR versus an inline code comment.
- **Neutral**: the numbering sequence is append-only, so gaps (from an abandoned Proposed
  ADR) are acceptable and numbers are never recycled.

## More Information

- Establishes the format, numbering, and lifecycle for every other ADR in this repository,
  ADR-0002 (WebGPU as the rendering and compute backend) through ADR-0016 (Testing
  strategy: Gherkin domain specs plus golden-image shader tests).
- Companion planning artifacts: the Gherkin feature suite under `features/` (for example
  `source-selection.feature`, `wipe-patterns.feature`, `event-memory.feature`), which
  ADRs cross-reference by filename.
- Authoritative behavioral source for all ADRs: `docs/wj-mx50-feature-reference.md`.
- Format background: MADR (Markdown Any Decision Records) and Michael Nygard's original
  "Documenting Architecture Decisions" pattern.
