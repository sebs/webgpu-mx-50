// The console theme (docs/STYLEGUIDE.md): design tokens and every component class the
// operator surface uses, distilled from the "Console UI mockups" design export
// (Nocturne token system + the broadcast LED palette). One stylesheet, injected once —
// primitives and blocks style themselves with these classes and never inline colours.
//
// Fonts are the system stack (no webfont/CDN — the app must work offline; if Inter is
// installed locally it is preferred, matching the styleguide's type choice).

export const THEME_STYLE_ID = 'mx-theme';

export const THEME_CSS = `
:root {
  --mx-bg: #161826;
  --mx-bg-deep: #0b0c14;
  --mx-surface: #232532;
  --mx-text: #e9e9ed;
  --mx-accent: #9184d9;
  --mx-n100: #f3f5fe; --mx-n200: #e4e7f5; --mx-n300: #cfd3e5; --mx-n400: #b2b6ca;
  --mx-n500: #9397ab; --mx-n600: #75798c; --mx-n700: #595d6c; --mx-n800: #3f424d;
  --mx-n900: #292b31;
  /* Panel-family neutrals used by the mockup's console chrome. */
  --mx-line: #2a2d3f;
  --mx-panel-hi: #1a1c2a;
  --mx-panel-lo: #131522;
  --mx-plate-hi: #1d1f2e;
  --mx-plate-lo: #0e0f1a;
  --mx-well: #0d0e17;
  --mx-label: #8b8fa3;
  --mx-label-dim: #6f7386;
  --mx-label-bright: #b6b9c6;
  /* Broadcast LED palette (styleguide: amber = armed/level, red = on-air, green = ready). */
  --mx-amber: #f2a23c;
  --mx-red: #e2564d;
  --mx-green: #4fd08a;
  --mx-led-off: #2a2d3f;
  --mx-handle-hi: #4a5069;
  --mx-handle-lo: #2b2f40;
  --mx-handle-edge: #575d78;
  --mx-font: "Inter", system-ui, sans-serif;
  --mx-mono: ui-monospace, Menlo, monospace;
}

@keyframes mxblink { 0%, 49% { opacity: 1; } 50%, 100% { opacity: 0.16; } }
@keyframes mxblinkfast { 0%, 39% { opacity: 1; } 40%, 100% { opacity: 0.16; } }
@media (prefers-reduced-motion: reduce) {
  .mxled .led, .mx-tally { animation: none !important; }
}

/* ---- Page shell ---- */
body { margin: 0; background: var(--mx-bg-deep); }
#app {
  max-width: 1560px; margin: 0 auto; padding: 18px 18px 26px; box-sizing: border-box;
  background: radial-gradient(120% 80% at 50% -10%, var(--mx-plate-hi), var(--mx-bg) 60%);
  font-family: var(--mx-font); color: var(--mx-text);
}
.mx-ucase { letter-spacing: 0.16em; text-transform: uppercase; }
.mx-head { display: flex; align-items: baseline; justify-content: space-between; padding: 0 2px 12px; }
.mx-head .brand-row { display: flex; align-items: baseline; gap: 12px; }
.mx-head .brand { font: 500 15px/1 var(--mx-font); }
.mx-head .sub, .mx-head .stat { font: 500 9px/1 var(--mx-font); letter-spacing: 0.18em; text-transform: uppercase; color: var(--mx-label); }
.mx-head .stat { display: flex; gap: 14px; letter-spacing: 0.14em; }

/* ---- Monitor bridge ---- */
.mx-bridge { display: grid; grid-template-columns: minmax(300px, 474px) 1fr; gap: 10px; margin-bottom: 12px; align-items: start; }
.mx-monitor { position: relative; aspect-ratio: 16 / 9; border-radius: 4px; overflow: hidden; border: 1px solid var(--mx-line); background: #000; }
.mx-monitor canvas, .mx-monitor video { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; display: block; background: #000; }
.mx-monitor .scan { position: absolute; inset: 0; pointer-events: none;
  background: repeating-linear-gradient(0deg, rgba(255,255,255,0.035) 0 1px, transparent 1px 3px); }
.mx-monitor .mon-label { position: absolute; left: 8px; bottom: 8px; font: 500 9px/1 var(--mx-font); letter-spacing: 0.16em; color: rgba(255,255,255,0.82); }
.mx-tally { position: absolute; right: 8px; top: 8px; width: 9px; height: 9px; border-radius: 2px; background: var(--mx-led-off); }
.mx-tally[data-state="ready"] { background: var(--mx-green); box-shadow: 0 0 10px var(--mx-green); }
.mx-tally[data-state="onair"] { background: var(--mx-red); box-shadow: 0 0 10px var(--mx-red); }
.mx-pgm { border-color: var(--mx-n700); box-shadow: 0 0 0 1px var(--mx-n800), 0 8px 30px rgba(0,0,0,0.6); }
.mx-chip-row { position: absolute; left: 10px; bottom: 10px; display: flex; gap: 8px; align-items: center; }
.mx-chip { font: 500 9px/1 var(--mx-font); letter-spacing: 0.2em; padding: 4px 7px; border-radius: 3px; background: rgba(0,0,0,0.55); color: #fff; }
.mx-chip.mono { font: 500 9px/1 var(--mx-mono); letter-spacing: 0.04em; color: rgba(255,255,255,0.75); }
.mx-onair { position: absolute; right: 10px; top: 10px; display: flex; align-items: center; gap: 6px; padding: 4px 8px; border-radius: 3px; background: rgba(0,0,0,0.55); font: 500 9px/1 var(--mx-font); letter-spacing: 0.18em; color: #fff; }
.mx-onair .led { width: 8px; height: 8px; border-radius: 50%; background: var(--mx-red); box-shadow: 0 0 10px var(--mx-red); }
.mx-mon-caption { display: flex; justify-content: space-between; gap: 8px; margin-top: 6px; font: 500 9px/1.3 var(--mx-font); letter-spacing: 0.18em; text-transform: uppercase; color: var(--mx-label); }
.mx-srcmons { display: flex; flex-direction: column; gap: 10px; }

/* ---- Console plate + blocks ---- */
mx-console { display: block; }
.mx-plate { display: grid; grid-template-columns: 336fr 176fr 176fr 208fr 624fr; grid-auto-rows: min-content;
  gap: 10px; padding: 12px; border-radius: 14px; min-width: 1100px;
  background: linear-gradient(180deg, var(--mx-plate-hi), var(--mx-plate-lo));
  border: 1px solid var(--mx-line); box-shadow: inset 0 1px 0 rgba(255,255,255,0.05), 0 16px 40px rgba(0,0,0,0.55); }
.mx-plate-scroll { overflow-x: auto; }
.mx-block { background: linear-gradient(180deg, var(--mx-panel-hi), var(--mx-panel-lo)); border: 1px solid var(--mx-line);
  border-radius: 8px; padding: 10px 11px 12px; display: flex; flex-direction: column; gap: 9px;
  box-shadow: inset 0 1px 0 rgba(255,255,255,0.04); min-width: 0; }
.mx-block-head { display: flex; justify-content: space-between; align-items: center;
  font: 500 9px/1 var(--mx-font); letter-spacing: 0.16em; text-transform: uppercase; color: var(--mx-label); }
.mx-block-id { font-size: 8px; padding: 2px 5px; border-radius: 3px; background: rgba(255,255,255,0.05); }
.mx-sep { border-top: 1px solid rgba(255,255,255,0.05); margin: 0; padding-top: 6px; }
.mx-note { font: 500 8px/1.4 var(--mx-font); letter-spacing: 0.08em; text-transform: uppercase; color: var(--mx-label-dim); }
.mx-row { display: flex; align-items: center; gap: 8px; }
.mx-grid { display: grid; gap: 6px; }
.mx-grid.tight { gap: 5px; }
.mx-vdivider { width: 1px; background: linear-gradient(180deg, transparent, rgba(255,255,255,0.08) 18%, rgba(255,255,255,0.08) 82%, transparent); }

/* ---- LED buttons ---- */
.mxled { display: flex; align-items: center; justify-content: center; gap: 6px; padding: 7px 6px; border-radius: 5px;
  border: 1px solid var(--mx-line); background: rgba(255,255,255,0.03); color: var(--mx-label-bright);
  font: 500 8.5px/1 var(--mx-font); letter-spacing: 0.08em; text-transform: uppercase; cursor: pointer;
  transition: background 110ms ease-out, border-color 110ms ease-out; }
.mxled:hover { background: rgba(255,255,255,0.07); }
.mxled.stack { flex-direction: column; gap: 5px; padding: 8px 2px 7px; }
.mxled .led { flex: none; background: var(--mx-led-off); transition: background 110ms ease-out; --led: var(--mx-amber); }
.mxled[data-tone="red"] .led { --led: var(--mx-red); }
.mxled[data-tone="green"] .led { --led: var(--mx-green); }
.mxled .led[data-shape="dot"] { width: 6px; height: 6px; border-radius: 50%; }
.mxled .led[data-shape="bar"] { width: 20px; height: 4px; border-radius: 2px; }
.mxled .led[data-shape="minibar"] { width: 14px; height: 3px; border-radius: 2px; }
.mxled[data-state="on"], .mxled[data-state="blink"], .mxled[data-state="blinkfast"] { border-color: var(--mx-handle-edge); background: rgba(255,255,255,0.08); color: var(--mx-text); }
.mxled[data-state="on"] .led, .mxled[data-state="blink"] .led, .mxled[data-state="blinkfast"] .led {
  background: var(--led); box-shadow: 0 0 9px color-mix(in srgb, var(--led) 75%, transparent); }
.mxled[data-state="blink"] .led { animation: mxblink 1s step-end infinite; }
.mxled[data-state="blinkfast"] .led { animation: mxblinkfast 0.5s step-end infinite; }
.mx-wide { align-self: stretch; padding: 13px 0; border-radius: 6px; letter-spacing: 0.2em; font-size: 11px; }

/* ---- Primitives ---- */
mx-slider { position: relative; display: block; flex: 1; height: 14px; border-radius: 7px; background: var(--mx-well);
  box-shadow: inset 0 1px 4px rgba(0,0,0,0.8); cursor: ew-resize; touch-action: none; }
mx-slider .fill { position: absolute; left: 2px; top: 5px; height: 4px; border-radius: 2px; background: var(--mx-amber); opacity: 0.55; pointer-events: none; }
mx-slider[data-tone="red"] .fill { background: var(--mx-red); opacity: 0.5; }
mx-slider .handle { position: absolute; top: 0; width: 9px; height: 14px; margin-left: -4px; border-radius: 3px;
  background: linear-gradient(180deg, var(--mx-handle-hi), var(--mx-handle-lo)); border: 1px solid var(--mx-handle-edge); pointer-events: none; }
.mx-srow { display: flex; align-items: center; gap: 7px; }
.mx-srow > .slabel { flex: none; width: 58px; font: 500 8px/1.3 var(--mx-font); letter-spacing: 0.1em; text-transform: uppercase; color: var(--mx-label-dim); }
.mx-srow > .svalue { flex: none; width: 44px; text-align: right; font: 500 9px/1 var(--mx-mono); color: var(--mx-label-bright); }

mx-fader { position: relative; display: block; width: 24px; height: 120px; border-radius: 4px;
  background: linear-gradient(180deg, var(--mx-well), #141624); box-shadow: inset 0 2px 5px rgba(0,0,0,0.8);
  cursor: ns-resize; touch-action: none; }
mx-fader .slot { position: absolute; left: 50%; top: 8px; bottom: 8px; width: 3px; transform: translateX(-50%); border-radius: 2px;
  background: #07080e; box-shadow: inset 0 0 3px rgba(0,0,0,0.9); }
mx-fader .handle { position: absolute; left: 3px; right: 3px; height: 14px; border-radius: 3px;
  background: linear-gradient(180deg, #3c4157, #262a3a); border: 1px solid #4b5069;
  box-shadow: 0 2px 4px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.14); pointer-events: none; }
mx-fader .handle::after { content: ""; position: absolute; left: 2px; right: 2px; top: 50%; height: 1px; background: rgba(0,0,0,0.65); }
.mx-meter { width: 5px; height: 120px; border-radius: 3px; background: var(--mx-well); box-shadow: inset 0 1px 4px rgba(0,0,0,0.8);
  display: flex; align-items: flex-end; overflow: hidden; }
.mx-meter > div { width: 100%; height: 0%;
  background: linear-gradient(0deg, var(--mx-green) 0%, var(--mx-green) 62%, var(--mx-amber) 84%, var(--mx-red) 100%); }
.mx-chan { display: flex; flex-direction: column; align-items: center; gap: 6px; }
.mx-chan .clabel { font: 500 7.5px/1 var(--mx-font); letter-spacing: 0.08em; text-transform: uppercase; color: var(--mx-label); }
.mx-chan .cvalue { font: 500 9px/1 var(--mx-mono); color: var(--mx-label-bright); }

mx-tbar { position: relative; display: block; width: 88px; height: 340px; flex: none; border-radius: 8px;
  background: linear-gradient(180deg, #0e1018, #161927); box-shadow: inset 0 2px 10px rgba(0,0,0,0.85);
  cursor: grab; touch-action: none; }
mx-tbar .slot { position: absolute; left: 50%; top: 16px; bottom: 16px; width: 10px; transform: translateX(-50%); border-radius: 5px;
  background: linear-gradient(90deg, #05060b, #12141f); box-shadow: inset 0 0 6px rgba(0,0,0,0.9); }
mx-tbar .travel { position: absolute; left: 50%; top: 16px; width: 2px; transform: translateX(-1px);
  background: var(--mx-amber); opacity: 0.45; box-shadow: 0 0 8px var(--mx-amber); pointer-events: none; }
mx-tbar .handle { position: absolute; left: 6px; right: 6px; height: 34px; border-radius: 6px;
  background: linear-gradient(180deg, var(--mx-handle-hi), var(--mx-handle-lo)); border: 1px solid var(--mx-handle-edge);
  box-shadow: 0 6px 14px rgba(0,0,0,0.65), inset 0 1px 0 rgba(255,255,255,0.16); pointer-events: none; }
mx-tbar .handle::after { content: ""; position: absolute; left: 10px; right: 10px; top: 50%; height: 2px; transform: translateY(-1px);
  border-radius: 1px; background: rgba(0,0,0,0.55); box-shadow: 0 4px 0 rgba(0,0,0,0.35), 0 -4px 0 rgba(0,0,0,0.35); }
.mx-busled { width: 12px; height: 12px; border-radius: 50%; background: var(--mx-led-off); transition: background 120ms ease-out; }
.mx-busled[data-on="true"] { background: var(--mx-amber); box-shadow: 0 0 10px var(--mx-amber); }

mx-joystick { position: relative; display: block; border-radius: 6px; box-shadow: inset 0 2px 8px rgba(0,0,0,0.8);
  cursor: crosshair; touch-action: none; overflow: hidden; }
mx-joystick[data-mode="knob"] { aspect-ratio: 1; background: radial-gradient(circle at 50% 50%, #1b1e2c, var(--mx-well)); }
mx-joystick[data-mode="frame"] { aspect-ratio: 1.2; background: linear-gradient(180deg, #12141f, var(--mx-bg-deep)); }
mx-joystick .haxis { position: absolute; left: 8px; right: 8px; top: 50%; height: 1px; background: rgba(255,255,255,0.08); }
mx-joystick .vaxis { position: absolute; top: 8px; bottom: 8px; left: 50%; width: 1px; background: rgba(255,255,255,0.08); }
mx-joystick .gridlines { position: absolute; inset: 0;
  background: linear-gradient(rgba(255,255,255,0.05) 1px, transparent 1px) 0 0 / 100% 25%,
    linear-gradient(90deg, rgba(255,255,255,0.05) 1px, transparent 1px) 0 0 / 25% 100%; }
mx-joystick .knob { position: absolute; width: 20px; height: 20px; margin: -10px 0 0 -10px; border-radius: 50%;
  background: radial-gradient(circle at 38% 32%, #464b63, #1c1f2d); border: 1px solid #565c76;
  box-shadow: 0 2px 6px rgba(0,0,0,0.7), 0 0 10px rgba(145,132,217,0.45); pointer-events: none; }
mx-joystick .frame { position: absolute; transform: translate(-50%, -50%); border: 1px solid var(--mx-amber); border-radius: 2px;
  background: rgba(242,162,60,0.12); box-shadow: 0 0 12px rgba(242,162,60,0.25); pointer-events: none; }
mx-joystick[data-disabled="true"] { opacity: 0.35; }

/* ---- Wipe pattern matrix + readouts ---- */
.mx-pat-row { display: flex; align-items: center; gap: 7px; }
.mx-pat-row .fam { flex: none; width: 60px; font: 500 8px/1.3 var(--mx-font); letter-spacing: 0.08em; text-transform: uppercase; color: var(--mx-label-dim); }
.mx-pat-row .fam[data-active="true"] { color: var(--mx-amber); }
.mx-pat-cells { display: grid; grid-template-columns: repeat(4, 1fr); gap: 5px; flex: 1; }
.mx-pat-cell { position: relative; height: 24px; border-radius: 4px; border: 1px solid var(--mx-line); background: var(--mx-well);
  cursor: pointer; overflow: hidden; padding: 0; transition: border-color 110ms ease-out, background 110ms ease-out; }
.mx-pat-cell:hover { border-color: var(--mx-n700); }
.mx-pat-cell .shape { position: absolute; inset: 3px; background: var(--mx-n700); }
.mx-pat-cell[aria-pressed="true"] { border-color: var(--mx-amber); background: rgba(242,162,60,0.08); }
.mx-pat-cell[aria-pressed="true"] .shape { background: var(--mx-amber); }
.mx-read { display: flex; justify-content: space-between; align-items: center; gap: 8px; padding: 8px 10px; border-radius: 5px;
  background: var(--mx-bg-deep); box-shadow: inset 0 1px 4px rgba(0,0,0,0.8); }
.mx-read .rlabel { font: 500 8px/1 var(--mx-font); letter-spacing: 0.14em; text-transform: uppercase; color: var(--mx-label-dim); }
.mx-read .rvalue { font: 500 15px/1 var(--mx-mono); color: var(--mx-amber); text-shadow: 0 0 10px rgba(242,162,60,0.35); }
.mx-read .rvalue.small { font-size: 14px; }

/* ---- Matte swatch, footer, misc ---- */
.mx-swatch { height: 38px; border-radius: 4px; border: 1px solid rgba(255,255,255,0.1); box-shadow: inset 0 1px 0 rgba(255,255,255,0.12); }
.mx-stepbtn { width: 28px; padding: 7px 0; border-radius: 4px; border: 1px solid var(--mx-line); background: rgba(255,255,255,0.03);
  color: var(--mx-label-bright); font: 500 11px/1 var(--mx-font); cursor: pointer; }
.mx-stepbtn:hover { background: rgba(255,255,255,0.07); }
.mx-stepname { flex: 1; text-align: center; font: 500 9px/1 var(--mx-font); letter-spacing: 0.1em; text-transform: uppercase; color: var(--mx-text); }
.mx-foot { display: flex; gap: 22px; flex-wrap: wrap; padding: 12px 4px 0; font: 400 10px/1.5 var(--mx-font); color: var(--mx-label-dim); }
.mx-ghostbtn { font: 500 8.5px/1 var(--mx-font); letter-spacing: 0.1em; text-transform: uppercase; padding: 5px 8px; border-radius: 4px;
  border: 1px solid var(--mx-line); background: rgba(255,255,255,0.03); color: var(--mx-label-bright); cursor: pointer; }
.mx-ghostbtn:hover { background: rgba(255,255,255,0.07); }

button:focus-visible, [tabindex]:focus-visible { outline: 2px solid var(--mx-accent); outline-offset: 2px; }
button { font-family: var(--mx-font); }
`;

/** Inject the theme stylesheet once per document. */
export function ensureTheme(): void {
  if (document.getElementById(THEME_STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = THEME_STYLE_ID;
  style.textContent = THEME_CSS;
  document.head.appendChild(style);
}
