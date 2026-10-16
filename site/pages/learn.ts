// Route: /learn/
//
// "Learn the panel": one live mixer that gains a block per step (site/tour.ts). Entering
// a step reloads the factory panel and applies that step's commands, so every step shows
// the same picture however you got there; the blocks added so far stay connected, in
// signal order. The step lives in the URL hash (#step-<id>) so a step can be linked.

import { mountShell, section, body, el, href } from '../shell.js';
import { liveBench, factoryState } from '../demos/live.js';
import { TOUR, blocksAt } from '../tour.js';

const main = mountShell({ route: 'learn/' });

const intro = el('section');
intro.style.padding = '64px 0 8px';
const introWrap = el('div', { class: 'mx-wrap' });
introWrap.innerHTML = `
  <span class="mx-label">Learn the panel</span>
  <h1 style="margin:14px 0 18px;max-width:22ch">Six steps, one mixer, one block at a time.</h1>
  <p class="mx-prose" style="font-size:17px;color:var(--mx-label);max-width:62ch">
    The full console has eleven blocks and hundreds of controls. This page starts with one picture and one
    block, and adds a block per step in signal order. Every control you see is the real block, connected to
    the real renderer. Nothing is mocked.
  </p>
  <p class="mx-prose mx-dim" style="max-width:62ch">
    When you've done all six, <a href="${href('console/')}">the console</a> is the same blocks on one plate, and
    <a href="${href('machine/')}">The Machine</a> explains each one against the manual.
  </p>`;
intro.appendChild(introWrap);
main.appendChild(intro);

const tourSection = section({});
const tourBody = body(tourSection);
main.appendChild(tourSection);

const nav = el('div', { class: 'mx-tour-nav', attrs: { role: 'group', 'aria-label': 'Tour steps' } });
tourBody.appendChild(nav);

const grid = el('div', { class: 'mx-tour' });
tourBody.appendChild(grid);

const text = el('div', { class: 'mx-panel mx-card' });
const kicker = el('span', { class: 'mx-label' });
const title = el('h2', { attrs: { style: 'margin:10px 0 12px' } });
const prose = el('div', { class: 'mx-prose' });
const tryLabel = el('span', { class: 'mx-label', text: 'Try this' });
const tryIt = el('p', { class: 'mx-note', attrs: { style: 'margin:8px 0 18px' } });
const stepper = el('div', { class: 'mx-row' });
const prev = el('button', { class: 'mx-btn', text: '← Back', attrs: { type: 'button' } });
const next = el('button', { class: 'mx-btn on', html: `<span class="led"></span>Next step`, attrs: { type: 'button' } });
const again = el('button', { class: 'mx-btn', text: 'Reset this step', attrs: { type: 'button' } });
stepper.append(prev, next, again);
text.append(kicker, title, prose, tryLabel, tryIt, stepper);
grid.appendChild(text);

const bench = liveBench({ id: 'tour', blocks: [], width: 960, height: 540, stacked: true, bare: true });
grid.appendChild(bench.root);

const navButtons: HTMLElement[] = [];
for (let i = 0; i < TOUR.length; i++) {
  const b = el('button', {
    class: 'mx-btn',
    html: `<span class="led"></span>${i + 1} · ${TOUR[i]!.title}`,
    attrs: { type: 'button' },
  });
  b.addEventListener('click', () => go(i));
  nav.appendChild(b);
  navButtons.push(b);
}

let current = 0;

/** Show exactly the blocks of step `index`, keeping elements that are already connected. */
function syncBlocks(index: number): void {
  const wanted = blocksAt(index);
  const existing = Array.prototype.slice.call(bench.side.children) as HTMLElement[];
  for (const node of existing) if (wanted.indexOf(node.localName) === -1) node.remove();
  for (let i = 0; i < wanted.length; i++) {
    const tag = wanted[i]!;
    let node = bench.side.querySelector(tag);
    if (!node) node = document.createElement(tag);
    bench.side.appendChild(node); // (re)append in signal order
  }
}

/** Factory panel + this step's commands, once the mixer is running. */
function applySetup(index: number): void {
  const ctx = bench.mixer.context;
  if (!ctx) return; // mx-ready re-applies the current step
  ctx.store.dispatch({ type: 'LOAD_STATE', state: factoryState() });
  const setup = TOUR[index]!.setup;
  for (let i = 0; i < setup.length; i++) ctx.store.dispatch(setup[i]!);
}

function go(index: number, updateHash = true): void {
  current = Math.max(0, Math.min(TOUR.length - 1, index));
  const step = TOUR[current]!;
  kicker.textContent = `Step ${current + 1} of ${TOUR.length}`;
  title.textContent = step.title;
  prose.innerHTML = step.prose;
  tryIt.innerHTML = step.tryIt;
  prev.toggleAttribute('disabled', current === 0);
  next.hidden = current === TOUR.length - 1;
  for (let i = 0; i < navButtons.length; i++) {
    if (i === current) navButtons[i]!.setAttribute('aria-current', 'step');
    else navButtons[i]!.removeAttribute('aria-current');
  }
  syncBlocks(current);
  applySetup(current);
  if (updateHash) history.replaceState(null, '', `#step-${step.id}`);
}

prev.addEventListener('click', () => go(current - 1));
next.addEventListener('click', () => go(current + 1));
again.addEventListener('click', () => applySetup(current));
bench.mixer.addEventListener('mx-ready', () => applySetup(current));

const fromHash = /^#step-(.+)$/.exec(location.hash);
let start = 0;
if (fromHash) for (let i = 0; i < TOUR.length; i++) if (TOUR[i]!.id === fromHash[1]) start = i;
go(start, false);
