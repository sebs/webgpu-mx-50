// Site chrome styles. Layered ON TOP of the console theme (src/ui/theme.ts), never beside
// it: every colour here is an --mx-* custom property that theme.ts already defines, so the
// console embedded in a page and the page around it are literally the same palette
// (docs/WEBSITE.md §6). The one deliberate extension is prose typography — a console
// styleguide sizes controls, not paragraphs.

export const SITE_STYLE_ID = 'mx-site';

export const SITE_CSS = `
:root { color-scheme: dark; }

[hidden] { display: none !important; }

html { scroll-behavior: smooth; }
@media (prefers-reduced-motion: reduce) { html { scroll-behavior: auto; } }

body.mx-site {
  margin: 0;
  min-height: 100vh;
  background:
    radial-gradient(1200px 600px at 50% -10%, #191c2e 0%, transparent 70%),
    var(--mx-bg-deep);
  color: var(--mx-text);
  font: 16px/1.65 var(--mx-font, system-ui, sans-serif);
  -webkit-font-smoothing: antialiased;
}

/* ---------- layout ---------- */

.mx-wrap { max-width: 1180px; margin: 0 auto; padding: 0 24px; }
.mx-prose { max-width: 68ch; }
.mx-prose p, .mx-prose ul, .mx-prose ol { margin: 0 0 1em; }
.mx-prose li { margin: 0.25em 0; }

/* ---------- top bar ---------- */

.mx-topbar {
  position: sticky; top: 0; z-index: 50;
  background: color-mix(in srgb, var(--mx-bg-deep) 88%, transparent);
  backdrop-filter: blur(8px);
  border-bottom: 1px solid var(--mx-line);
}
.mx-topbar-inner {
  display: flex; align-items: center; gap: 20px;
  height: 56px;
}
.mx-wordmark {
  display: inline-flex; align-items: baseline; gap: 9px;
  text-decoration: none; color: var(--mx-text); font-weight: 600; letter-spacing: -0.01em;
}
.mx-wordmark .dot {
  width: 8px; height: 8px; border-radius: 50%;
  background: var(--mx-red); box-shadow: 0 0 9px color-mix(in srgb, var(--mx-red) 75%, transparent);
}
.mx-nav { display: flex; gap: 4px; margin-left: auto; align-items: center; }
.mx-nav a {
  color: var(--mx-label); text-decoration: none;
  font-size: 9px; font-weight: 500; text-transform: uppercase; letter-spacing: 0.14em;
  padding: 8px 10px; border-radius: 6px;
}
.mx-nav a:hover { color: var(--mx-text); background: color-mix(in srgb, var(--mx-panel-hi) 70%, transparent); }
.mx-nav a[aria-current="page"] { color: var(--mx-text); }
.mx-nav a[aria-current="page"]::after {
  content: ""; display: block; height: 2px; margin-top: 6px; border-radius: 2px;
  background: var(--mx-amber); box-shadow: 0 0 9px color-mix(in srgb, var(--mx-amber) 75%, transparent);
}
.mx-nav a:focus-visible, .mx-wordmark:focus-visible, .mx-cta:focus-visible {
  outline: 2px solid var(--mx-accent); outline-offset: 2px;
}
/* The CTA takes the amber "armed" LED treatment, NOT the accent — --mx-accent stays
   focus-only per STYLEGUIDE.md. */
.mx-cta {
  display: inline-flex; align-items: center; gap: 8px;
  border: 1px solid color-mix(in srgb, var(--mx-amber) 45%, var(--mx-line));
  background: linear-gradient(180deg, var(--mx-panel-hi), var(--mx-panel-lo));
  color: var(--mx-text); text-decoration: none; border-radius: 7px;
  padding: 7px 13px; font-size: 9px; font-weight: 500;
  text-transform: uppercase; letter-spacing: 0.14em; white-space: nowrap;
}
.mx-cta .led {
  width: 6px; height: 6px; border-radius: 50%; background: var(--mx-amber);
  box-shadow: 0 0 9px color-mix(in srgb, var(--mx-amber) 75%, transparent);
}
.mx-cta:hover { border-color: color-mix(in srgb, var(--mx-amber) 70%, var(--mx-line)); }

@media (max-width: 860px) {
  .mx-nav a { padding: 8px 6px; letter-spacing: 0.08em; }
  .mx-topbar-inner { height: auto; padding: 10px 0; flex-wrap: wrap; }
}

/* ---------- type ---------- */

.mx-label {
  font-size: 9px; font-weight: 500; text-transform: uppercase;
  letter-spacing: 0.16em; color: var(--mx-label-dim);
}
h1, h2, h3, h4 { letter-spacing: -0.015em; line-height: 1.2; margin: 0 0 0.5em; }
h1 { font-size: clamp(28px, 4vw, 42px); font-weight: 650; }
h2 { font-size: clamp(21px, 2.4vw, 27px); font-weight: 600; margin-top: 0; }
h3 { font-size: 17px; font-weight: 600; }
a { color: var(--mx-text); text-decoration-color: var(--mx-line); text-underline-offset: 3px; }
a:hover { text-decoration-color: var(--mx-amber); }
code, .mono { font-family: var(--mx-mono, ui-monospace, monospace); font-size: 0.88em; }
code { color: var(--mx-amber); }
.mx-dim { color: var(--mx-label); }

/* ---------- section rhythm ---------- */

.mx-section { padding: 56px 0; border-top: 1px solid var(--mx-line); }
.mx-section:first-of-type { border-top: 0; }
.mx-section-head { margin-bottom: 28px; }
.mx-section-head .mx-label { display: block; margin-bottom: 10px; }

/* ---------- panels & cards ---------- */

.mx-panel {
  background: linear-gradient(180deg, var(--mx-panel-hi), var(--mx-panel-lo));
  border: 1px solid var(--mx-line); border-radius: 8px;
  box-shadow: inset 0 1px 0 rgba(255,255,255,0.04);
}
.mx-card { padding: 20px 22px; }
.mx-grid { display: grid; gap: 18px; }
.mx-grid.cols-2 { grid-template-columns: repeat(2, minmax(0,1fr)); }
.mx-grid.cols-3 { grid-template-columns: repeat(3, minmax(0,1fr)); }
@media (max-width: 900px) { .mx-grid.cols-2, .mx-grid.cols-3 { grid-template-columns: 1fr; } }

/* The block card — the repeating content unit (docs/WEBSITE.md §2). Named mx-bcard, not
   mx-block: .mx-block is the console theme's own block chrome, and the live benches put
   real connected blocks on these pages. */
.mx-bcard { margin: 0 0 26px; overflow: hidden; }
.mx-bcard-head {
  display: flex; align-items: baseline; gap: 12px; flex-wrap: wrap;
  padding: 14px 22px; border-bottom: 1px solid var(--mx-line);
  background: color-mix(in srgb, var(--mx-well) 55%, transparent);
}
.mx-bcard-head h3 { margin: 0; }
.mx-bcard-body { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1.05fr); }
@media (max-width: 980px) { .mx-bcard-body { grid-template-columns: 1fr; } }
.mx-pane { padding: 18px 22px; min-width: 0; }
.mx-pane + .mx-pane { border-left: 1px solid var(--mx-line); }
@media (max-width: 980px) { .mx-pane + .mx-pane { border-left: 0; border-top: 1px solid var(--mx-line); } }
.mx-pane > .mx-label { display: block; margin-bottom: 10px; }
.mx-pane p:last-child { margin-bottom: 0; }
.mx-pane-demo { background: color-mix(in srgb, var(--mx-well) 40%, transparent); }
.mx-bcard-live { grid-column: 1 / -1; padding: 18px 22px; border-top: 1px solid var(--mx-line); }
.mx-bcard-live > .mx-label { display: block; margin-bottom: 12px; }

/* ---------- chips ---------- */

.mx-chips { display: flex; flex-wrap: wrap; gap: 6px; }
.mx-chip {
  display: inline-flex; align-items: center; gap: 6px;
  border: 1px solid var(--mx-line); border-radius: 999px;
  padding: 3px 9px; background: var(--mx-well);
  font-size: 9px; font-weight: 500; text-transform: uppercase; letter-spacing: 0.12em;
  color: var(--mx-label);
}
.mx-chip .led { width: 6px; height: 6px; border-radius: 50%; background: var(--mx-led-off); }
.mx-chip.on .led   { background: var(--mx-amber); box-shadow: 0 0 8px color-mix(in srgb, var(--mx-amber) 75%, transparent); }
.mx-chip.live .led { background: var(--mx-red);   box-shadow: 0 0 8px color-mix(in srgb, var(--mx-red) 75%, transparent); }
.mx-chip.ok .led   { background: var(--mx-green); box-shadow: 0 0 8px color-mix(in srgb, var(--mx-green) 75%, transparent); }

/* ---------- tables ---------- */

.mx-tablewrap { overflow-x: auto; border: 1px solid var(--mx-line); border-radius: 8px; }
table.mx-table { border-collapse: collapse; width: 100%; font-size: 14px; }
table.mx-table th, table.mx-table td {
  text-align: left; padding: 9px 14px; border-bottom: 1px solid var(--mx-line); vertical-align: top;
}
table.mx-table th {
  font-size: 9px; font-weight: 500; text-transform: uppercase; letter-spacing: 0.14em;
  color: var(--mx-label-dim); background: color-mix(in srgb, var(--mx-well) 55%, transparent);
}
table.mx-table tr:last-child td { border-bottom: 0; }

/* ---------- readouts (amber mono digits on an inset well) ---------- */

.mx-readout {
  display: inline-block; padding: 6px 11px; border-radius: 6px;
  background: var(--mx-well); border: 1px solid var(--mx-line);
  box-shadow: inset 0 2px 5px rgba(0,0,0,0.45);
  font-family: var(--mx-mono, ui-monospace, monospace);
  color: var(--mx-amber); text-shadow: 0 0 9px color-mix(in srgb, var(--mx-amber) 45%, transparent);
}
.mx-readout.big { font-size: 26px; padding: 10px 16px; }
.mx-readout.muted { color: var(--mx-label); text-shadow: none; }

/* ---------- generic controls used inside demos ---------- */

.mx-btn {
  border: 1px solid var(--mx-line); border-radius: 6px;
  background: linear-gradient(180deg, #232739, #171a28);
  color: var(--mx-text); padding: 7px 12px; cursor: pointer;
  font-size: 9px; font-weight: 500; text-transform: uppercase; letter-spacing: 0.12em;
  display: inline-flex; align-items: center; gap: 7px;
}
.mx-btn:hover { border-color: #3a3f56; }
.mx-btn:focus-visible { outline: 2px solid var(--mx-accent); outline-offset: 2px; }
.mx-btn .led { width: 6px; height: 6px; border-radius: 50%; background: var(--mx-led-off); }
.mx-btn[aria-pressed="true"] .led, .mx-btn.on .led {
  background: var(--mx-amber); box-shadow: 0 0 8px color-mix(in srgb, var(--mx-amber) 75%, transparent);
}
.mx-btn[aria-pressed="true"], .mx-btn.on { border-color: color-mix(in srgb, var(--mx-amber) 40%, var(--mx-line)); }
.mx-btn.live[aria-pressed="true"] .led { background: var(--mx-red); box-shadow: 0 0 8px color-mix(in srgb, var(--mx-red) 75%, transparent); }

.mx-row { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
.mx-field { display: flex; flex-direction: column; gap: 6px; }
.mx-field > span { font-size: 9px; text-transform: uppercase; letter-spacing: 0.14em; color: var(--mx-label-dim); }

input[type="range"].mx-range { -webkit-appearance: none; appearance: none; width: 100%; height: 14px; background: transparent; }
input[type="range"].mx-range:focus-visible { outline: 2px solid var(--mx-accent); outline-offset: 3px; }
input[type="range"].mx-range::-webkit-slider-runnable-track {
  height: 14px; border-radius: 7px; background: var(--mx-well);
  border: 1px solid var(--mx-line); box-shadow: inset 0 2px 5px rgba(0,0,0,0.5);
}
input[type="range"].mx-range::-webkit-slider-thumb {
  -webkit-appearance: none; appearance: none; width: 9px; height: 22px; margin-top: -5px;
  border-radius: 3px; background: linear-gradient(180deg, #4a5069, #2b2f40); border: 1px solid #575d78;
}
input[type="range"].mx-range::-moz-range-track {
  height: 14px; border-radius: 7px; background: var(--mx-well); border: 1px solid var(--mx-line);
}
input[type="range"].mx-range::-moz-range-thumb {
  width: 9px; height: 22px; border-radius: 3px;
  background: linear-gradient(180deg, #4a5069, #2b2f40); border: 1px solid #575d78;
}

input[type="number"].mx-input, input[type="text"].mx-input, select.mx-input {
  background: var(--mx-well); border: 1px solid var(--mx-line); border-radius: 6px;
  color: var(--mx-text); padding: 7px 10px; font: inherit; font-size: 14px;
}
input.mx-input:focus-visible, select.mx-input:focus-visible { outline: 2px solid var(--mx-accent); outline-offset: 1px; }

canvas.mx-canvas {
  width: 100%; height: auto; display: block; border-radius: 6px;
  background: var(--mx-well); border: 1px solid var(--mx-line);
}

/* ---------- connected blocks on site pages ----------
   A real block ([role=group] is set by its chrome) keeps the console theme: undo the
   site's prose-scale .mx-grid / .mx-row / .mx-note for anything inside one. */

.mx-block[role="group"] .mx-grid { gap: 6px; }
.mx-block[role="group"] .mx-grid.tight { gap: 5px; }
.mx-block[role="group"] .mx-row { flex-wrap: nowrap; gap: 8px; }
.mx-block[role="group"] .mx-note {
  border-left: 0; padding: 0; margin: 0;
  font: 500 8px/1.4 var(--mx-font); letter-spacing: 0.08em; text-transform: uppercase; color: var(--mx-label-dim);
}

/* ---------- live benches (site/demos/live.ts) ---------- */

.mx-live { margin: 0; }
mx-mixer.mx-bench {
  display: grid; grid-template-columns: minmax(0, 1.55fr) minmax(250px, 1fr); gap: 14px;
  align-items: start; background: transparent;
}
mx-mixer.mx-bench.stacked { grid-template-columns: minmax(0, 1fr); }
/* Mix/Wipe is the console's widest block (lever + family grid): give it a real column. */
mx-mixer.mx-bench.wide { grid-template-columns: minmax(0, 1fr) minmax(560px, 1fr); }
@media (max-width: 1100px) { mx-mixer.mx-bench.wide { grid-template-columns: minmax(0, 1fr); } }
@media (max-width: 860px) { mx-mixer.mx-bench { grid-template-columns: minmax(0, 1fr); } }
mx-mixer.mx-bench > canvas, .mx-bench-screen {
  width: 100%; height: auto; border-radius: 6px; border: 1px solid var(--mx-line); background: #000;
}
mx-mixer.mx-bench > canvas + .mx-bench-screen { display: none; }
.mx-bench-screen { display: flex; align-items: center; justify-content: center; padding: 18px; box-sizing: border-box; }
.mx-bench-screen.poster { position: relative; padding: 0; overflow: hidden; }
.mx-bench-screen.poster img, .mx-bench-screen.poster video { display: block; width: 100%; height: 100%; object-fit: cover; }
.mx-bench-screen.poster .mx-chip { position: absolute; left: 10px; bottom: 10px; }
.mx-bench-side { display: flex; flex-direction: column; gap: 10px; min-width: 0; }
.mx-bench-side[hidden] { display: none; }
.mx-bench-side .mx-block { margin: 0; }
mx-mixer.mx-bench.stacked .mx-bench-side { flex-direction: row; flex-wrap: wrap; align-items: flex-start; }
mx-mixer.mx-bench.stacked .mx-bench-side > * { flex: 1 1 280px; }
mx-mixer.mx-bench.stacked .mx-bench-side > mx-mixwipe-block { flex: 2 1 560px; }
.mx-bench-bar { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; margin-top: 10px; }
.mx-bench-bar .mx-chip { margin-right: auto; }
.mx-live.unavailable mx-mixer.mx-bench { grid-template-columns: minmax(0, 1fr); }
.mx-live.unavailable .needs-gpu { display: none; }
.mx-live .mx-code { margin-top: 10px; }

/* ---------- the wipe wall (site/demos/wipe-wall.ts) ---------- */

.mx-wall-focus { display: grid; grid-template-columns: minmax(0, 2fr) minmax(240px, 1fr); gap: 18px; margin-bottom: 22px; }
@media (max-width: 860px) { .mx-wall-focus { grid-template-columns: minmax(0, 1fr); } }
.mx-wall-screen { display: block; width: 100%; height: auto; border-radius: 6px; border: 1px solid var(--mx-line); background: #000; }
.mx-wall-side { display: flex; flex-direction: column; gap: 12px; min-width: 0; }
.mx-wall-side .mx-readout.big { align-self: flex-start; }
.mx-wall-grid { display: grid; grid-template-columns: 6.5em repeat(4, minmax(0, 1fr)); gap: 8px; align-items: center; }
@media (max-width: 700px) {
  .mx-wall-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .mx-wall-family { grid-column: 1 / -1; margin-top: 6px; }
}
.mx-wall-cell {
  position: relative; display: block; padding: 0; margin: 0; cursor: pointer; overflow: hidden;
  border: 1px solid var(--mx-line); border-radius: 5px; background: #000; aspect-ratio: 16 / 9;
}
.mx-wall-cell canvas { display: block; width: 100%; height: 100%; }
.mx-wall-cell:focus-visible { outline: 2px solid var(--mx-accent); outline-offset: 2px; }
.mx-wall-cell[aria-pressed="true"] { border-color: var(--mx-amber); box-shadow: 0 0 0 1px var(--mx-amber); }
.mx-wall-tag {
  position: absolute; left: 6px; bottom: 5px; padding: 1px 5px; border-radius: 3px;
  background: rgba(0,0,0,0.62); color: #fff; font: 500 11px/1.4 var(--mx-mono, ui-monospace, monospace);
}

/* ---------- code blocks ---------- */

.mx-code { border: 1px solid var(--mx-line); border-radius: 8px; background: var(--mx-well); overflow: hidden; }
.mx-code[hidden] { display: none; }
.mx-code-head {
  display: flex; align-items: center; justify-content: space-between; gap: 10px;
  padding: 6px 8px 6px 12px; border-bottom: 1px solid var(--mx-line);
}
.mx-code pre { margin: 0; padding: 12px 14px; overflow-x: auto; font-size: 13px; line-height: 1.55; }
.mx-code code { color: var(--mx-text); font-size: 13px; }

/* ---------- examples (embed page) ---------- */

.mx-example { display: grid; grid-template-columns: minmax(0, 1fr); gap: 14px; }
.mx-example-stage { min-width: 0; }
.mx-example-stage > mx-mixer, .mx-example-stage mx-mixer > canvas { border-radius: 6px; }
.mx-example-stage > p > button {
  border: 1px solid var(--mx-line); border-radius: 6px; background: linear-gradient(180deg, #232739, #171a28);
  color: var(--mx-text); padding: 7px 11px; cursor: pointer; margin: 0 4px 6px 0;
  font-size: 9px; font-weight: 500; text-transform: uppercase; letter-spacing: 0.12em;
}
.mx-example-stage > p > button:focus-visible { outline: 2px solid var(--mx-accent); outline-offset: 2px; }
.mx-example-stage output { display: block; font-family: var(--mx-mono, ui-monospace, monospace); font-size: 13px; color: var(--mx-amber); }
.mx-example-stage pre { white-space: pre-wrap; word-break: break-all; font-size: 12px; color: var(--mx-label); margin: 8px 0 0; }
.mx-log {
  font-family: var(--mx-mono, ui-monospace, monospace); font-size: 12px; color: var(--mx-label);
  background: var(--mx-well); border: 1px solid var(--mx-line); border-radius: 6px;
  padding: 8px 10px; height: 7.5em; overflow-y: auto; white-space: pre-wrap;
}
.mx-gallery { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 18px; }
.mx-gallery .mx-card { display: flex; flex-direction: column; gap: 12px; }
.mx-gallery .stage { display: flex; justify-content: center; align-items: center; min-height: 140px; }
.mx-playground textarea {
  width: 100%; min-height: 15em; box-sizing: border-box; resize: vertical;
  background: var(--mx-well); color: var(--mx-text); border: 1px solid var(--mx-line); border-radius: 8px;
  padding: 12px 14px; font: 13px/1.55 var(--mx-mono, ui-monospace, monospace);
}
.mx-playground textarea:focus-visible { outline: 2px solid var(--mx-accent); outline-offset: 1px; }
.mx-playground iframe {
  width: 100%; height: 560px; border: 1px solid var(--mx-line); border-radius: 8px; background: var(--mx-bg-deep);
}

/* ---------- recipes & tour ---------- */

ol.mx-steps { list-style: none; margin: 0; padding: 0; font-size: 14px; }
ol.mx-steps li {
  display: grid; grid-template-columns: 4.2em minmax(0, 1fr) 1.4em; gap: 8px; align-items: baseline;
  padding: 5px 8px; border-radius: 5px;
}
ol.mx-steps li .kw { color: var(--mx-label-dim); font-size: 9px; text-transform: uppercase; letter-spacing: 0.14em; }
ol.mx-steps li .res { text-align: center; }
ol.mx-steps li.now { background: color-mix(in srgb, var(--mx-amber) 14%, transparent); }
ol.mx-steps li.done { color: var(--mx-label); }
ol.mx-steps li.pass .res { color: var(--mx-green); }
ol.mx-steps li.fail .res { color: var(--mx-red); }
ol.mx-steps li.extra { font-style: italic; }

.mx-tour-nav { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 18px; }
.mx-tour-nav .mx-btn[aria-current="step"] { border-color: color-mix(in srgb, var(--mx-amber) 60%, var(--mx-line)); }
.mx-tour-nav .mx-btn[aria-current="step"] .led {
  background: var(--mx-amber); box-shadow: 0 0 8px color-mix(in srgb, var(--mx-amber) 75%, transparent);
}
.mx-tour { display: grid; grid-template-columns: minmax(0, 0.85fr) minmax(0, 2fr); gap: 22px; align-items: start; }
.mx-tour > .mx-card { position: sticky; top: 72px; }
@media (max-width: 980px) { .mx-tour { grid-template-columns: minmax(0, 1fr); } .mx-tour > .mx-card { position: static; } }

/* ---------- hero monitor (overview attract mode) ---------- */

.mx-hero-monitor { position: relative; margin-top: 30px; }
.mx-hero-monitor mx-mixer { display: block; background: #000; border-radius: 8px; overflow: hidden; border: 1px solid var(--mx-line); }
.mx-hero-monitor mx-mixer > canvas { width: 100%; height: auto; display: block; }
/* Before boot a host has no canvas and so no height: give it its picture's box, so a
   run="visible" host has something to intersect and the page does not jump. */
.mx-hero-monitor mx-mixer:not(:has(> canvas)),
.mx-example-stage mx-mixer:not(:has(> canvas)):not(:has(.mx-mixer-unavailable)) { aspect-ratio: 16 / 9; background: #000; }
.mx-hero-monitor .mx-chip-row { position: absolute; left: 12px; bottom: 12px; display: flex; gap: 8px; }
.mx-hero-monitor[hidden] { display: none; }
.mx-hero-monitor video { display: block; width: 100%; height: auto; border-radius: 8px; border: 1px solid var(--mx-line); background: #000; }

/* ---------- footer ---------- */

.mx-footer { border-top: 1px solid var(--mx-line); padding: 34px 0 60px; margin-top: 40px; color: var(--mx-label); font-size: 14px; }
.mx-footer a { color: var(--mx-label); }
.mx-footer-cols { display: flex; gap: 40px; flex-wrap: wrap; justify-content: space-between; }

/* ---------- misc ---------- */

/* A prose callout. The console theme also defines .mx-note — as an 8px uppercase panel
   label — and loads first, so restore prose type here; real blocks get the theme's version
   back through the .mx-block[role="group"] rule above. */
.mx-note {
  border-left: 2px solid var(--mx-amber); padding: 2px 0 2px 14px;
  color: var(--mx-label); margin: 0 0 1em;
  font: inherit; font-size: 15px; line-height: 1.6; letter-spacing: normal; text-transform: none;
}
.mx-skip {
  position: absolute; left: -9999px; top: 0; background: var(--mx-panel-hi);
  padding: 10px 16px; border-radius: 6px; z-index: 100;
}
.mx-skip:focus { left: 12px; top: 12px; }
`;

/** Inject the site chrome stylesheet once. Call after the console theme is present. */
export function ensureSiteStyles(): void {
  if (document.getElementById(SITE_STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = SITE_STYLE_ID;
  style.textContent = SITE_CSS;
  document.head.appendChild(style);
}
