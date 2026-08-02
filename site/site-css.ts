// Site chrome styles. Layered ON TOP of the console theme (src/ui/theme.ts), never beside
// it: every colour here is an --mx-* custom property that theme.ts already defines, so the
// console embedded in a page and the page around it are literally the same palette
// (docs/WEBSITE.md §6). The one deliberate extension is prose typography — a console
// styleguide sizes controls, not paragraphs.

export const SITE_STYLE_ID = 'mx-site';

export const SITE_CSS = `
:root { color-scheme: dark; }

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

/* The block card — the repeating content unit (docs/WEBSITE.md §2). */
.mx-block { margin: 0 0 26px; overflow: hidden; }
.mx-block-head {
  display: flex; align-items: baseline; gap: 12px; flex-wrap: wrap;
  padding: 14px 22px; border-bottom: 1px solid var(--mx-line);
  background: color-mix(in srgb, var(--mx-well) 55%, transparent);
}
.mx-block-head h3 { margin: 0; }
.mx-block-body { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1.05fr); }
@media (max-width: 980px) { .mx-block-body { grid-template-columns: 1fr; } }
.mx-pane { padding: 18px 22px; min-width: 0; }
.mx-pane + .mx-pane { border-left: 1px solid var(--mx-line); }
@media (max-width: 980px) { .mx-pane + .mx-pane { border-left: 0; border-top: 1px solid var(--mx-line); } }
.mx-pane > .mx-label { display: block; margin-bottom: 10px; }
.mx-pane p:last-child { margin-bottom: 0; }
.mx-pane-demo { background: color-mix(in srgb, var(--mx-well) 40%, transparent); }

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

/* ---------- footer ---------- */

.mx-footer { border-top: 1px solid var(--mx-line); padding: 34px 0 60px; margin-top: 40px; color: var(--mx-label); font-size: 14px; }
.mx-footer a { color: var(--mx-label); }
.mx-footer-cols { display: flex; gap: 40px; flex-wrap: wrap; justify-content: space-between; }

/* ---------- misc ---------- */

.mx-note {
  border-left: 2px solid var(--mx-amber); padding: 2px 0 2px 14px;
  color: var(--mx-label); margin: 0 0 1em;
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
