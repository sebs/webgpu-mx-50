# Music video file format

A **music video file** is a JSON document that `music-video.html` plays on the web-mx-50
mixer against a song: which clips feed the mixer's inputs, and what the operator does on
the panel, beat by beat — cuts, wipes, keys, effects, the Downstream Key, fades. The page
renders it live; `npm run video:record` turns it into an MP4.

This document is the complete reference. It is written so that a person **or an LLM** can
write a file from it alone. The validator is strict and its messages point at the exact
JSON path, so the loop is: write → `npm run video:check` → fix → load.

> Format `web-mx-50/music-video`, version 1. Source of truth: the loader
> [`site/music-video/document.ts`](../site/music-video/document.ts) and the engine
> [`site/music-video/score.ts`](../site/music-video/score.ts). The bundled example is
> [`video/first-cut.json`](../video/first-cut.json) — read it next to this page.

## Workflow

1. Put the song and the clips in `video/` and run `npm run video:media`. It encodes Full HD
   copies into `video/web/` — `clip.mov` becomes `web/clip.mp4`, `track.wav` becomes
   `web/track.m4a`. **The file refers to these encoded names.**
2. `npm run video:analyse -- video/track.wav` measures the song: `bpm`, `downbeat`, length,
   the energy of every bar, and suggested section starts (drops are "high", breaks "low").
3. Write `video/<name>.json`.
4. `npm run video:check -- video/<name>.json` until it says `ok`.
5. Watch it: `npm run dev`, open `/music-video.html?video=video/<name>.json`, or press
   **Load…** and pick the `.json` (plus any media not in `video/web/`). **Save** writes the
   loaded file back out.
6. Record it: `npm run site:build && npm run video:record -- video/<name>.json` →
   `video/render/<title>.mp4`.

## Time

Everything sits on the song's **bar grid**, from `song.bpm` and `song.downbeat` (the time in
seconds of bar 0, beat 1). The track is assumed to be in 4/4.

| Where | Unit | Example |
|---|---|---|
| positions: `at`, `from`, `to` | **bars**, fractional | `16` = bar 16, `16.25` = its 2nd beat, `16.5` = 3rd, `16.75` = 4th |
| a position in seconds | `{"time": s}` | `{"time": 0}` — the very top, before bar 0 |
| `every`, `length` of `cuts` `takes` `steps` `montage` `punch` | **beats** | `2` = every half bar, `0.5` = eighth notes |
| `every` of `rotate` | **bars** | `2` = a new clip every two bars |
| clip `from`, `duration`, `stagger` | seconds of the clip | |

Bars before 0 do not exist: anything before the first downbeat uses `{"time": …}`.

## The file

```json
{
  "format": "web-mx-50/music-video",
  "version": 1,
  "title": "Night drive",
  "description": "optional, free text",
  "song": { "file": "track.m4a", "bpm": 124, "downbeat": 0.21, "length": 241.5 },
  "clips": [
    { "id": "city", "file": "city.mp4", "label": "City", "duration": 12.4 },
    { "id": "lines", "file": "lines.mp4" }
  ],
  "patch": { "1": "city", "2": "city", "3": "lines", "4": "lines", "ext": "lines" },
  "edit": []
}
```

| Key | Required | Meaning |
|---|---|---|
| `format`, `version` | yes | exactly `"web-mx-50/music-video"` and `1` |
| `title` | yes | shown on the page; also names Save and recordings |
| `song.file` | yes | the soundtrack (an encoded name in `video/web/`) |
| `song.bpm`, `song.downbeat` | yes | the grid, from `video:analyse` |
| `song.length` | no | seconds; measured from the song when left out |
| `clips[]` | yes | `id` (your name for it), `file`, optional `label` and `duration` (measured when left out). Clips loop. |
| `patch` | yes | which clip feeds each **input** at the start: Sources `"1"`–`"4"` and `"ext"` (External Camera In — the Downstream Key's title input). All five are required; one clip may feed several inputs. |
| `edit` | no | the cut: sections, cues and moves, read top to bottom |

## The mixer in one page

The cut is played by a 1990s two-bus vision mixer. What matters for writing a file:

- **Two buses, A and B.** Each selects one input: Source 1–4 or `"matte"` (a flat colour).
  The **lever** goes from 0 (all A) to 1 (all B). A hard **cut** is the lever jumping 0↔1;
  a dissolve or wipe is the lever travelling.
- **Transition type** decides what the lever does between A and B:
  `mix` (dissolve), `nam` (the brighter picture wins, pixel by pixel), `wipe` (a pattern
  reveals B), `lum-key` (B is keyed over A by **brightness**: B's pixels at or above the
  **slice** level are kept, darker ones show A; the lever is the key's opacity),
  `chroma-key` (B keyed by hue; set the hue with a raw `SET_HUE` command).
- **Digital effect** works on **one bus at a time** (A or B): filters `nega`, `mosaic`,
  `mono`, `paint` and the frame-memory effects `still`, `strobe`, `trail`, `multi`
  (a grid of 4, 9 or 16 pictures). It sits before the transition, so an effect on B is
  keyed or wiped along with B.
- **Colour correction** per bus: `chroma-only` (saturation, lanes `chromaA/B`: 0 = grey,
  0.5 = untouched, 1 = vivid) or `chroma-plus-joystick` (adds a colour cast that the
  `hueA/B` lanes turn around the colour wheel).
- **Downstream Key (DSK)** sits after everything: it takes a key picture — the `ext` input,
  or bus A or B — and turns the parts whose brightness lies in the **low…high** window
  into a title, filled white or with the matte colour, with an optional border or shadow.
  The default window (0…0.42) picks **dark lines on a light background** — a drawing or
  black text on white — and lays them over the picture.
- **Fade** is last: it takes the picture (and, separately, the DSK title) towards a
  target — `black`, `white`, the `matte` colour, or bus `A`/`B` — by the **fade** lane.
- **A/V Synchro** pulses chosen effects on the effect bus whenever the song's low end
  (the kick) is loud; the `avLevel` lane is the threshold.
- **The patch** (which clip is in which input) is not a panel control: re-patching an
  input that is on air is a hard cut on that picture; re-patching one that is off air is
  invisible — the next transition reveals the new clip.

## Edit items

`edit` is one list. Each item is a **section**, a **cue** or a **move**, in any order —
group them by section, like a script. Items at the same moment apply in file order.

### Section

```json
{ "section": "Drop I · cut on the beat", "at": 16 }
```

A named marker: the page's section label, its ticks on the scrubber, and ←/→ navigation.

### Cue — a moment

```json
{
  "at": 12,
  "note": "optional, free text",
  "do": [{ "transition": "mix" }, { "effect": { "bus": "B", "mono": true } }],
  "patch": { "1": "crew" },
  "play": { "crew": { "from": 3, "rate": 1 } }
}
```

- `do` — **steps**, applied in order (below).
- `patch` — re-patch some inputs (`"1"`–`"4"`, `"ext"`) to clips.
- `play` — restart a clip at `from` seconds, and/or change its playback `rate`
  (0.0625–16; 0.5 is half speed). Without `from` the clip continues where it is.
  A clip keeps running whether or not it is patched anywhere.

### Steps

Each step is an object with exactly one key. Steps say **what the panel should look like**;
the player presses the panel's buttons as often as it takes, so a step can be repeated
safely.

| Step | Value | Effect |
|---|---|---|
| `buses` | `[a, b]`, each `1`–`4` or `"matte"` | select bus A's and bus B's source |
| `transition` | `"mix"` · `"nam"` · `"wipe"` · `"lum-key"` · `"chroma-key"` | transition type |
| `wipe` | `{ "pattern": 1–28, "reverse"?, "edge"?, "multi"?: 0–6, "blinds"?, "pairing"? }` | selects `wipe` with this pattern; `edge` is `hard` (default) · `border-narrow` · `border-wide` · `soft-narrow` · `soft-wide`; `multi` repeats the pattern; modifiers default to off |
| `effect` | `{ "bus": "A"\|"B", "nega"?, "mosaic"?, "mono"?, "paint"?, "still"?, "strobe"?, "trail"?, "multi"?: 0\|4\|9\|16 }` | **exactly** these effects on that bus, everything else off. `{"bus":"A"}` alone clears the block. |
| `avSynchro` | list of `nega` `mosaic` `mono` `paint` `still` `strobe`; `[]` = off | pulse these on the effect bus with the kick |
| `colourCorrect` | `{ "bus": "A"\|"B", "mode": "off"\|"chroma-only"\|"chroma-plus-joystick" }` | colour correction mode |
| `dsk` | `false`, or `{ "fill"?: "white"\|"matte", "source"?: "ext"\|"A"\|"B", "low"?, "high"?, "edge"?, "edgeColor"?, "reverse"? }` | the Downstream Key on (defaults: white fill, `ext`, window 0–0.42, edge `normal`). `edge`: `normal` · `narrow-border` · `wide-border` · `narrow-shadow` · `wide-shadow` · `drop-shadow`. `edgeColor` (a colour name) applies to the white fill only. `reverse` keys everything **outside** the window. |
| `fade` | `{ "target": "black"\|"white"\|"matte"\|"A"\|"B", "video"?: bool, "dsk"?: bool }` | what the fade lane fades to, and whether it fades the picture and/or the DSK title (both default `true`) |
| `matte` | colour name | the matte colour (the `"matte"` bus source, the DSK matte fill) |
| `border` | colour name | the wipe border colour (needs a `border-*` edge) |
| `positioner` | `true` · `false` | picture-in-picture: B in a box over A. **Needs a square-family wipe (25–28) selected first.** The lever sizes the box, the `orbit` lane moves it. |
| `command` | a raw store command, e.g. `{ "type": "SET_HUE", "angle": 0.3 }` | escape hatch for controls without a step (`SET_HUE`, `SET_PAINT_LEVEL`, `SET_WIPE_ASPECT`, `PRESS_COMPRESSION`, `SET_MULTI_MODE`, …). Runner commands (Auto Take/Fade) are not allowed. |

Colour names: `white` `yellow` `cyan` `green` `magenta` `red` `blue` `black`.

### Moves — phrases over a span

Moves write **lanes** (continuous controls, next section) and generate cues.

| Move | Fields | What it does |
|---|---|---|
| `set` | `lane`, `at`, `value`, `curve`? | one lane point (curve shapes the segment *leaving* it; default `hold`) |
| `ramp` | `lane`, `from`, `to`, `values: [start, end]`, `curve`? | travel from start to end over the span (`linear` default, `ease`, or `hold`), then stay |
| `steps` | `lane`, `from`, `every` (beats), `values: [...]` | one held value per step |
| `cuts` | `from`, `to`, `every` (beats), `start`?: 0\|1 | the lever snaps between the buses every step, starting at `start` (0 = A on air) |
| `takes` | `from`, `to`, `every` (beats), `length` (beats), `start`?, `curve`? | the lever travels across in `length` beats, every `every` beats, alternating direction — dissolves or wipes on the beat |
| `pump` | `from`, `to`, `low`, `high` | the slice drops to `low` on every beat and opens to `high` before the next — a key that breathes with the kick |
| `flash` | `at` | the fade lane rises over the beat before `at` and lets go over the two beats after. Set the fade `target` (e.g. `white`) in a cue first. |
| `rotate` | `input`, `from`, `to`, `every` (**bars**), `clips: [...]`, `rate`? | patch the next clip from the list into the input every `every` bars, restarting it |
| `montage` | `input`, `from`, `to`, `every` (beats), `clips: [...]`, `stagger`? | a different clip into the input every step, each entering `k × stagger` seconds into itself (default 1.37) |
| `punch` | `bus`, `from`, `to`, `every` (beats), `sources: [...]` | switch the bus to the next source (1–4, `"matte"`) every step — an operator punching buttons |

`input` is `1`–`4` or `"ext"`. A span runs from `from` up to (not including) `to`.

### Lanes

| Lane | Range | Drives |
|---|---|---|
| `lever` | 0–1 | the A/B lever (and the key's opacity, and the positioner's size) |
| `fade` | 0–1 | the fade amount towards the fade target |
| `slice` | 0–1 | the luminance key's threshold (chroma key: its tolerance) |
| `mosaic` | 1–31 | mosaic block size |
| `chromaA`, `chromaB` | 0–1 | colour correction saturation per bus |
| `hueA`, `hueB` | turns, any number | the colour cast's angle (needs `chroma-plus-joystick`); 0 → 1 is one trip round the wheel |
| `strobe` | 0–1 | strobe interval (0 = fastest) |
| `dskHigh` | 0–1 | the DSK window's top — ramp it to 0 and the title thins out and vanishes |
| `orbit` | turns | where the positioner's box is on an ellipse round the centre |
| `avLevel` | 0–1 | A/V Synchro threshold (higher = only the loudest hits) |

A lane is silent until its first point; from then on **it owns that control** and sets it
every frame, holding its last value forever — a cue or raw command on the same control is
overridden (the checker warns). So: give `lever` and `fade` a point at `{"time": 0}`, and
use lanes, not cues, for anything that moves.

## Wipe patterns

`pattern` is 1–28; `"reverse": true` runs it the other way.

| Patterns | Family | Notes |
|---|---|---|
| 1–4 | straight | edges across the frame |
| 5–8 | corner | from a corner |
| 9–12 | diagonal | |
| 13–16 | triangle | |
| 17–20 | split | from the centre line outward |
| 21–24 | mosaic | a field of blocks — no blinds |
| 25 square · 26 circle (iris) · 27 oval · 28 diamond | square | centred shapes — the only family with the **positioner**; no blinds |

## What the panel refuses

The player runs every step through the real machine. These requests are refused by the
hardware's own rules, and the checker reports each one as a warning on the step:

- `positioner: true` without a square-family wipe (25–28) selected first.
- `blinds` on a mosaic or square pattern (the panel falls back to a straight wipe).
- `avSynchro` while `trail` is on — and `trail` switches A/V Synchro off.
- `still` together with `strobe` or `multi` in one effect step (an error).
- The **matte** is never the DSK's key: a bus on `"matte"` used as the DSK `source` keys
  its last real source instead.

## Craft notes

- **Cut on downbeats** (whole bars) for structure, on beats for energy, on half beats for a
  build. `video:analyse` sections tell you where drops (high) and breaks (low) start.
- **Re-patch off air.** Swap the clip on the bus that is *not* on air, then dissolve to it —
  new footage without a visible cut.
- **Drawings and text on white** go on the `ext` input with the DSK (fill `white` with a
  coloured `wide-border`, or fill `matte` with the matte colour); on black (`nega` on that
  bus) they also work as a `lum-key` over another picture.
- **A white flash** on a drop: a cue with `{"fade": {"target": "white", "video": true, "dsk": false}}`
  some time before, and `{"move": "flash", "at": <bar>}`.
- **Titles on black**: fade the video to black with `"dsk": false` — the DSK title stays.
- Keep **one look per section**, and change something every 8 bars.

## A complete small example

Two clips over sixteen bars: a fade-up, cuts on the beat, a wipe, a drawing keyed on top,
and a fade out.

```json music-video
{
  "format": "web-mx-50/music-video",
  "version": 1,
  "title": "Sixteen bars",
  "song": { "file": "song.m4a", "bpm": 130.97, "downbeat": 0.503 },
  "clips": [
    { "id": "crew", "file": "142032-779071806.mp4", "label": "Crew" },
    { "id": "crowd", "file": "142030-779071797.mp4", "label": "Crowd" },
    { "id": "drawing", "file": "140629-775595871.mp4", "label": "Drawing" }
  ],
  "patch": { "1": "crew", "2": "crowd", "3": "crew", "4": "crowd", "ext": "drawing" },
  "edit": [
    { "section": "Fade up", "at": { "time": 0 } },
    { "at": { "time": 0 }, "do": [{ "buses": [1, 2] }, { "transition": "mix" }, { "fade": { "target": "black" } }] },
    { "move": "set", "lane": "lever", "at": { "time": 0 }, "value": 0 },
    { "move": "set", "lane": "fade", "at": { "time": 0 }, "value": 1 },
    { "move": "ramp", "lane": "fade", "from": 0, "to": 2, "values": [1, 0], "curve": "ease" },

    { "section": "Cuts", "at": 4 },
    { "move": "cuts", "from": 4, "to": 8, "every": 2, "start": 1 },

    { "section": "Wipes and a drawing", "at": 8 },
    { "at": 8, "do": [
      { "wipe": { "pattern": 26, "edge": "border-wide" } }, { "border": "yellow" },
      { "dsk": { "fill": "white", "edge": "wide-border", "edgeColor": "magenta" } }
    ], "play": { "drawing": { "from": 0 } } },
    { "move": "takes", "from": 8, "to": 14, "every": 4, "length": 1, "start": 0 },

    { "section": "Out", "at": 14 },
    { "move": "ramp", "lane": "fade", "from": 14, "to": 16, "values": [0, 1], "curve": "ease" }
  ]
}
```

## Checklist for a generated file

- `format`, `version`, `title`, `song` (from `video:analyse`), `clips`, `patch` with all five inputs.
- `lever` and `fade` lanes start at `{"time": 0}`; the first cue sets `buses` and a `transition`.
- Every `at`/`from`/`to` is inside the song (bars ≤ length ÷ bar seconds).
- `every` is in beats — except `rotate`, which is in bars.
- `npm run video:check -- <file>` prints `ok` with no warnings.
