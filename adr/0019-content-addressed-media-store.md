# ADR-0019: Content-addressed media store for preset binary content

- Status: Accepted
- Date: 2026-08-19
- Deciders: project owner

## Context and Problem Statement

Captured Scene-Grabber stills live as heavy blobs in IndexedDB, keyed **by slot**
(`still:N`, src/core/event-memory.ts), while panel snapshots carry only the key
(ADR-0015). Slot-scoped keys create three problems: two Event Memory slots cannot
share one still; copying or exporting a preset cannot carry its still (imported banks
strip references, because `still:3` on another machine names unrelated pixels); and
every recall re-reads and re-uploads pixels even when they are already resident.

The owner wants presets to **share binary content** so it "does not have to be loaded
again", and has decided: **preset files never embed stills — they reference them, and
references are checked by hash against the content** (e.g. of an image).

## Decision Drivers

- One blob for identical content, regardless of how many slots/presets reference it.
- Preset files stay small and portable; a reference must be verifiable anywhere.
- Recall of already-resident content must skip both the IndexedDB read and the GPU
  upload.
- The existing safety order (blob first, bank commit second, removals after; boot
  sweep retires orphans — src/persistence/still-store.ts) must survive unchanged.
- No second notion of identity: captured stills and picked media files (e.g. images)
  should share the same identity scheme.

## Considered Options

### Option A — Keep slot keys, add embedding to preset files

- Good: smallest change.
- Bad: files balloon with base64 pixels; duplicates multiply on import; sharing
  between slots remains impossible. **Rejected by decision of record** (no embedding).

### Option B — Reference counting per blob

- Good: precise lifetimes.
- Bad: refcounts drift under crashes exactly where the current design is robust; the
  codebase already has mark-and-sweep (`sweepOrphans` walks a root set). **Rejected.**

### Option C — Content addressing by hash (chosen)

Key every blob by the SHA-256 of its content (pixel buffer + grab metadata for
stills; raw file bytes for picked media). Snapshots and preset files carry the hash.

- Good: dedup is inherent; references are machine-independent and verifiable
  ("check by hash"); the existing mark-and-sweep generalises verbatim (roots = all
  bank slots + live panel + any future library); a GPU texture cache keyed by hash
  makes repeat recalls a pointer swap.
- Neutral: hashing is async (`crypto.subtle.digest`) and joins the still-store's
  existing serialised promise chain.
- Bad: a one-time migration pass over existing `still:N` blobs.

## Decision Outcome

Chosen option: **C — content-addressed blobs, reference-only preset files.**

- `positioner.stillId` (and any future media reference) becomes a content hash.
- **Preset files reference by hash only, never embed.** On import, each referenced
  hash is checked against the local blob store: present → nothing to load (the
  "loaded once" guarantee); absent → the slot degrades to the existing fresh-grab
  fallback, and can be **re-linked by content**: loading any file whose hash matches
  the missing reference (e.g. re-picking the same image) satisfies it.
- Recall keeps an LRU of uploaded GPU still textures keyed by hash; a hash hit skips
  IndexedDB and upload entirely.
- Lifetimes stay mark-and-sweep: `sweepOrphans` unchanged in mechanism, roots now
  hashes. The blob-first/commit-second ordering contract is untouched.
- Migration: one boot pass hashes each legacy `still:N` blob, rewrites it under its
  hash, patches snapshot references; the sweep retires the old keys.

### Consequences

**Good**

- Identical content stored once; presets share it by construction.
- Preset files become fully portable between machines without growing.
- Repeat recalls stop costing readback/upload.

**Bad**

- Imported references to content the machine has never seen stay unsatisfied until
  matching content arrives (accepted: fresh-grab fallback covers the gap, as today).

**Neutral**

- Hash computation adds one async step to the capture path, serialised where all
  tier operations already serialise.

## More Information

- ADR-0015 (Persistence) — the two-tier design this re-keys.
- ADR-0018 (MIDI control surface) — the preset-recall surface motivating sharing.
- src/persistence/still-store.ts — the ordering contract and sweep this preserves.
