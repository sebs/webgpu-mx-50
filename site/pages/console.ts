// Route: /console/
//
// The real application, in its own document, so a GPU device loss cannot take the page
// down with it. The capability banner is decided at runtime by asking for an adapter —
// never by sniffing browser names, which rot.

import { mountShell, section, body, el, siteRoot, href, srcLink } from '../shell.js';
import { DEFAULT_BINDINGS } from '../../src/control/bindings.js';
import { esc } from '../shell.js';
import '../demos/control.js';

const main = mountShell({ route: 'console/' });

const intro = el('section');
intro.style.padding = '48px 0 8px';
const introWrap = el('div', { class: 'mx-wrap' });
introWrap.innerHTML = `
  <span class="mx-label">The console</span>
  <h1 style="margin:14px 0 14px;max-width:24ch">Run the mixer.</h1>
  <p class="mx-prose" style="color:var(--mx-label);max-width:64ch">
    Four sources arrive as live procedural feeds with their own monitors. Bus A starts on Source 1,
    bus B on Source 2, transition MIX. Drag the lever to blend them — then try NAM, a wipe family,
    per-bus colour correction, and the digital effects on top.
  </p>
  <div id="cap"></div>`;
intro.appendChild(introWrap);
main.appendChild(intro);

// ---------------------------------------------------------------- capability + frame

const frameSection = section({});
const frameBody = body(frameSection);
main.appendChild(frameSection);

const cap = document.getElementById('cap')!;

interface GpuNav {
  gpu?: { requestAdapter(): Promise<unknown | null> };
}

const mountConsole = (): void => {
  const shell = el('div', { class: 'mx-panel' });
  shell.style.cssText = 'overflow:hidden;padding:0';
  const frame = document.createElement('iframe');
  frame.src = new URL('app/index.html', siteRoot()).href;
  frame.title = 'web-mx-50 console';
  frame.style.cssText = 'width:100%;height:min(88vh,1000px);border:0;display:block;background:var(--mx-bg-deep)';
  frame.setAttribute('allow', 'camera; microphone');
  shell.appendChild(frame);
  frameBody.appendChild(shell);

  const openNew = el('p', { class: 'mx-dim' });
  openNew.style.marginTop = '12px';
  openNew.innerHTML =
    `A console wants room. <a href="${new URL('app/index.html', siteRoot()).href}" target="_blank" rel="noopener">` +
    `Open it full-screen in a new tab &rarr;</a>`;
  frameBody.appendChild(openNew);
};

const nav = navigator as unknown as GpuNav;
if (!nav.gpu) {
  cap.innerHTML = `
    <div class="mx-panel mx-card" style="margin-top:22px;border-color:color-mix(in srgb, var(--mx-red) 45%, var(--mx-line))">
      <div class="mx-row" style="gap:10px;margin-bottom:10px">
        <span class="mx-chip live"><span class="led"></span>WebGPU unavailable</span>
      </div>
      <p style="margin:0 0 8px">This browser exposes no <code>navigator.gpu</code>, so the renderer cannot start
      here. That is a capability fact, not a verdict on your browser — support is arriving unevenly and this page
      checks at runtime rather than guessing from a version list.</p>
      <p class="mx-dim" style="margin:0">Everything else on this site still works: the domain demos across
      <a href="${href('machine/')}">The Machine</a>, <a href="${href('machine/wipes/')}">the wipe engine</a> and
      <a href="${href('architecture/')}">Architecture</a> run without a GPU by design.</p>
    </div>`;
} else {
  cap.innerHTML = `<div class="mx-row" style="margin-top:22px"><span class="mx-chip"><span class="led"></span>checking adapter…</span></div>`;
  void nav
    .gpu!.requestAdapter()
    .then((adapter) => {
      if (!adapter) {
        cap.innerHTML = `
          <div class="mx-panel mx-card" style="margin-top:22px">
            <span class="mx-chip live"><span class="led"></span>no adapter</span>
            <p style="margin:10px 0 0">Your browser has the WebGPU API but no adapter was granted — often a
            headless, virtualised or blocklisted GPU. The domain demos elsewhere on the site are unaffected.</p>
          </div>`;
        return;
      }
      cap.innerHTML = `<div class="mx-row" style="margin-top:22px"><span class="mx-chip ok"><span class="led"></span>WebGPU adapter available</span></div>`;
      mountConsole();
    })
    .catch(() => {
      cap.innerHTML = `<div class="mx-row" style="margin-top:22px"><span class="mx-chip live"><span class="led"></span>adapter request failed</span></div>`;
    });
}

// ---------------------------------------------------------------- try this

const tryThis = section({ label: 'Try this', title: 'Five things worth a minute' });
const tryBody = body(tryThis);
const recipes: Array<[string, string]> = [
  ['Blend two live feeds', 'Drag the Mix/Wipe lever with MIX selected. Then switch to NAM and drag it again — NAM keeps the brighter pixel of the two, so highlights punch through instead of averaging.'],
  ['Build a Mosaic Spotlight', 'Select a Square wipe, turn the Positioner on, then put Mosaic on one bus. The lever sizes the censor block and the joystick moves it. Add BORDER to outline it.'],
  ['Freeze a picture-in-picture', 'Square wipe + Positioner, size the inset with the lever, then press SCENE GRABBER. The still holds while the joystick keeps moving it around the live background.'],
  ['Store and recall a look', 'Set up something you like, press MEMORY then EVENT 1. Change everything. Press EVENT 1, then AUTO TAKE — the whole panel comes back.'],
  ['Use your own footage', 'Each source monitor has a Load clip… button, plus camera and still-image options. The media stays in your browser as an object URL and is never uploaded anywhere.'],
];
const grid = el('div', { class: 'mx-grid cols-2' });
for (let i = 0; i < recipes.length; i++) {
  const card = el('div', { class: 'mx-panel mx-card' });
  card.innerHTML = `<h3 style="margin:0 0 8px">${esc(recipes[i]![0])}</h3><p class="mx-dim" style="margin:0">${esc(recipes[i]![1])}</p>`;
  grid.appendChild(card);
}
tryBody.appendChild(grid);
main.appendChild(tryThis);

// ---------------------------------------------------------------- control map

const map = section({ label: 'Controls', title: 'The default binding table' });
const mapBody = body(map);
mapBody.appendChild(
  el('p', {
    class: 'mx-prose',
    html:
      `Bindings are data, not code — remappable at runtime and persisted. These are the shipped
       defaults, read out of <code>DEFAULT_BINDINGS</code> at page load.`,
  }),
);
const table = el('div', { class: 'mx-tablewrap' });
const rows: string[] = [];
const addresses = Object.keys(DEFAULT_BINDINGS);
for (let i = 0; i < addresses.length; i++) {
  const a = addresses[i]!;
  const b = DEFAULT_BINDINGS[a]!;
  const kind = a.split(':')[0] ?? '';
  rows.push(
    `<tr><td><span class="mx-chip">${esc(kind)}</span></td><td><code>${esc(a.split(':')[1] ?? a)}</code></td>` +
      `<td><code>${esc(b.control)}</code></td><td>${esc(b.mode)}</td></tr>`,
  );
}
table.innerHTML =
  `<table class="mx-table"><thead><tr><th>Input</th><th>Address</th><th>Logical control</th><th>Mode</th></tr></thead>` +
  `<tbody>${rows.join('')}</tbody></table>`;
mapBody.appendChild(table);

const traceIntro = el('p', { class: 'mx-prose' });
traceIntro.style.marginTop = '24px';
traceIntro.innerHTML = `Watch a press travel through the layer — address, binding, normalised signal,
  resolved command, store:`;
mapBody.appendChild(traceIntro);
const tracePanel = el('div', { class: 'mx-panel mx-card' });
tracePanel.appendChild(document.createElement('mx-demo-control-map'));
mapBody.appendChild(tracePanel);
main.appendChild(map);

// ---------------------------------------------------------------- attract note

const attract = section({ label: 'Still to come', title: 'Attract mode' });
body(attract).appendChild(
  el('div', {
    class: 'mx-prose',
    html:
      `<p>The console runs here in free play. What it does not yet do is drive itself — a scripted
       loop calling a wipe pattern, running an Auto Take, pushing a colour correction, keying a title
       and fading out, so the front page can show the machine working with no interaction.</p>
      <p>That needs three pieces: the automation surface extended with colour-correction and DSK
      operations (today it exposes Auto Take, Auto Fade, transition time, wipe-pattern call and
      Event-Memory stepping — and is constructed only in tests, never in the app); a bridge so the
      hosting page can start it inside this frame; and an ephemeral boot mode that swaps in an
      in-memory storage backend, so an attract loop can never read or overwrite the console state
      <em>you</em> saved.</p>
      <p class="mx-dim">Source: ${srcLink('src/control/automation.ts')} · ${srcLink('src/persistence/backend.ts')}</p>`,
  }),
);
main.appendChild(attract);
