# Console styleguide

Distilled from the **“Console UI mockups.zip”** design export in the repo root (two
`MX50 Console` design-canvas pages plus the *Nocturne* design-system tokens). That zip
is the visual source of truth; this document is its operational summary, and
[`src/ui/theme.ts`](../src/ui/theme.ts) is its executable form — every token below
exists there as a CSS custom property. Never hard-code a colour or font in a
component; use the theme classes.

## Direction

**Broadcast console, clean modern** (ADR-0013's hybrid stance): the layout, grouping
and metaphors of the WJ-MX50 panel — monitor bridge above, one console plate below,
blocks named and lettered like the hardware (B-1…B-5, C, D, E, F, H) — rendered as a
quiet dark interface, not a photoreal panel. No wood grain, no screws, no bitmap
textures; depth comes from gradients, inset shadows and hairline seams.

## Ground and surfaces (Nocturne)

| Token | Value | Use |
|---|---|---|
| `--mx-bg-deep` | `#0b0c14` | page ground |
| `--mx-bg` | `#161826` | app backdrop (radial-lit from above) |
| `--mx-plate-hi/lo` | `#1d1f2e → #0e0f1a` | the console plate gradient |
| `--mx-panel-hi/lo` | `#1a1c2a → #131522` | each block panel gradient |
| `--mx-well` | `#0d0e17` | control wells (slider slots, joystick pads, readouts) |
| `--mx-line` | `#2a2d3f` | hairline borders everywhere |
| `--mx-text` / `--mx-label` / `--mx-label-dim` | `#e9e9ed` / `#8b8fa3` / `#6f7386` | text ramp |
| `--mx-accent` | `#9184d9` | **focus rings only** — never a fill |

Every block: panel gradient + 1px `--mx-line` border + 8px radius + a 1px white-4%
inset top highlight. The plate adds a deep drop shadow; monitors get a scanline veil
(`repeating-linear-gradient`, white 3.5% every 3px).

## LED language (broadcast palette)

State lives in the LED, not the button fill. Buttons stay dark; a small LED (dot,
20×4 bar, or 14×3 minibar) carries the state with a soft glow (`0 0 9px` at ~75%).

| Colour | Token | Meaning |
|---|---|---|
| Amber `#f2a23c` | `--mx-amber` | selected / armed / level fills, the lever travel line |
| Red `#e2564d` | `--mx-red` | on-air: Program Out, tallies, DSK ON, ON AIR |
| Green `#4fd08a` | `--mx-green` | ready / stored / Audio Follow |
| Off `#2a2d3f` | `--mx-led-off` | idle |

Blink states are steps, not fades (`step-end`, 1 s; a 0.5 s fast variant), used for:
the substitute-source rule, CC chroma-only mode, armed memory slots/macros, paused
Auto Take/Fade, wide border/soft states. `prefers-reduced-motion` pins them solid.

## Type

System stack (`Inter` preferred if locally installed — never loaded from a CDN; the
app is offline-capable). Labels are the signature: 8–9px, weight 500, uppercase,
letter-spaced 0.08–0.2em. Values and timecode in `ui-monospace`. Readout boxes show
amber mono digits with a faint glow on a `--mx-well` inset.

## Controls (the primitives)

- **`mx-slider`** — 14px slot well, amber level line at 55%, 9×14 machined handle
  (`#4a5069→#2b2f40`, `#575d78` edge). Red line variant for the Fade lever.
- **`mx-fader`** — 24×120 vertical well, centre groove, capped handle with scribe
  line; paired 5px meter (green→amber→red gradient).
- **`mx-tbar`** — the hero: 88×340 slot, wide handle with grip line, amber travel
  line with glow, A/B bus LEDs alongside, AUTO TAKE beneath.
- **`mx-joystick`** — `knob` mode (radial well, crosshair, 20px cap with accent
  glow) for RGB colour correction; `frame` mode (grid-lined screen, amber inset
  frame) for the Positioner.

All primitives: pointer-captured drag, arrows step (Shift = fine, PageUp/Down =
coarse, Home/End = ends), ARIA slider semantics, 2px accent `:focus-visible` ring.

## Layout

Monitor bridge: source monitors (with tallies + corner labels) left at 474px,
Program monitor right with PROGRAM OUT/timecode chips bottom-left and ON AIR
top-right. Console plate grid columns `336 · 176 · 176 · 208 · 624` (as fr):
Sources / Matte / Colour Corr / Positioner on row 1, the Mix/Wipe block with the
lever column spanning all rows at right; Digital Effect + Freeze/A-V Synchro,
then Audio / DSK / Fade, then Event Memory + Special Modes. Footer carries the
three operator hints. Below ~1100px the plate scrolls horizontally — a console
keeps its geometry.
