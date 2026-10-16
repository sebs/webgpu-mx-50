// Route: /machine/recipes/
//
// The manual's combination recipes (reference §16, features/combination-recipes.feature),
// each a card: the recipe's banner text and scenario list come from recipes.json — parsed
// from the feature file, never typed here — and a played scenario gets a live mixer plus
// a step-by-step player. Each step dispatches the same commands the cucumber step
// definitions do (site/recipes.ts); each Then step evaluates the scenario's domain check
// against the live panel and shows ✓ or ✗. Without WebGPU the player still runs, against
// a headless engine, so the checks are visible on any browser.

import { mountShell, section, body, el, href, loadGenerated, srcLink, esc, REPO } from '../shell.js';
import { liveBench, factoryState } from '../demos/live.js';
import { RECIPE_SCRIPTS } from '../recipes.js';
import { createEngine } from '../../src/app.js';
import type { RecipeScript, RecipeStep } from '../recipes.js';
import type { PanelStore } from '../../src/state/store.js';
import type { MxMixer } from '../../src/ui/mixer.js';

interface ScenarioJson {
  name: string;
  keyword: string;
  steps: string[];
  executed: boolean;
  examples: number;
  line: number;
}

interface RecipeJson {
  number: number;
  name: string;
  blurb: string;
  scenarios: ScenarioJson[];
  played: string | null;
  deferred: string | null;
}

const STEP_MS = 850;

const main = mountShell({ route: 'machine/recipes/' });

const intro = el('section');
intro.style.padding = '64px 0 8px';
const introWrap = el('div', { class: 'mx-wrap' });
introWrap.innerHTML = `
  <span class="mx-label">The Machine · reference §16</span>
  <h1 style="margin:14px 0 18px;max-width:24ch">Combination recipes, played from their specs.</h1>
  <p class="mx-prose" style="font-size:17px;color:var(--mx-label);max-width:64ch">
    The manual ends with the looks that only appear when blocks are stacked. Each one is a Gherkin
    scenario in ${srcLink('features/combination-recipes.feature', 'combination-recipes.feature')}. Press
    <strong>Play</strong> and the steps run one by one on a live mixer, dispatching the same commands
    the CI step definitions do. Each <em>Then</em> step checks its assertion against the panel and
    shows the result.
  </p>
  <p class="mx-prose mx-dim" style="max-width:64ch">
    Two recipes are written in the feature file but deliberately not executed. They are shown with the reason,
    not hidden. The single blocks each recipe stacks are on <a href="${href('machine/')}">The Machine</a>.
  </p>`;
intro.appendChild(introWrap);
main.appendChild(intro);

const list = section({});
const listBody = body(list);
main.appendChild(list);

function keywordOf(step: string): { kw: string; text: string } {
  const m = /^(Given|When|Then|And|But|\*)\s+(.*)$/.exec(step);
  return m ? { kw: m[1]!, text: m[2]! } : { kw: '', text: step };
}

function scenarioList(recipe: RecipeJson): HTMLElement {
  const ul = el('ul', { class: 'mx-prose' });
  ul.style.cssText = 'margin:0;padding-left:1.1em;font-size:14px';
  for (let i = 0; i < recipe.scenarios.length; i++) {
    const s = recipe.scenarios[i]!;
    const li = el('li');
    const rows = s.examples > 1 ? ` <span class="mx-dim">× ${s.examples}</span>` : '';
    li.innerHTML =
      `<a href="${REPO}/blob/main/features/combination-recipes.feature#L${s.line}">${esc(s.name)}</a>${rows} ` +
      `<span class="mx-chip${s.executed ? ' ok' : ''}" style="margin-left:4px"><span class="led"></span>${s.executed ? 'executes in CI' : 'authored, deferred'}</span>`;
    ul.appendChild(li);
  }
  return ul;
}

/** The step list for a scenario; returns the <li> per Gherkin step and its script step (if any). */
function stepList(scenario: ScenarioJson, script: RecipeScript | null): { ol: HTMLElement; rows: { li: HTMLElement; step: RecipeStep | null }[] } {
  const ol = el('ol', { class: 'mx-steps' });
  const rows: { li: HTMLElement; step: RecipeStep | null }[] = [];
  let cursor = 0;
  for (let i = 0; i < scenario.steps.length; i++) {
    const { kw, text } = keywordOf(scenario.steps[i]!);
    let match: RecipeStep | null = null;
    if (script) {
      for (let j = cursor; j < script.steps.length; j++) {
        if (script.steps[j]!.step === text) {
          match = script.steps[j]!;
          cursor = j + 1;
          break;
        }
      }
    }
    const li = el('li');
    li.innerHTML = `<span class="kw">${esc(kw)}</span><span>${esc(text)}</span><span class="res" aria-hidden="true"></span>`;
    if (script && !match) li.title = 'Not played on this page (still executed in CI)';
    ol.appendChild(li);
    rows.push({ li, step: match });
  }
  return { ol, rows };
}

function recipeCard(recipe: RecipeJson): HTMLElement {
  const card = el('article', { class: 'mx-panel mx-bcard', attrs: { id: `recipe-${recipe.number}` } });
  const head = el('div', { class: 'mx-bcard-head' });
  head.appendChild(el('h3', { text: `Recipe ${recipe.number} — ${recipe.name}` }));
  const chips = el('div', { class: 'mx-chips' });
  chips.appendChild(
    el('span', {
      class: 'mx-chip' + (recipe.deferred ? '' : ' ok'),
      html: `<span class="led"></span>${recipe.deferred ? 'deferred' : 'played below'}`,
    }),
  );
  head.appendChild(chips);
  card.appendChild(head);

  const bodyEl = el('div', { class: 'mx-bcard-body' });

  const p1 = el('div', { class: 'mx-pane' });
  p1.innerHTML = `<span class="mx-label">From the manual</span><p class="mx-prose" style="margin:0 0 14px">${esc(recipe.blurb)}</p>` +
    `<span class="mx-label">Its scenarios</span>`;
  p1.appendChild(scenarioList(recipe));
  bodyEl.appendChild(p1);

  const p2 = el('div', { class: 'mx-pane mx-pane-demo' });
  const script = RECIPE_SCRIPTS.filter((s) => s.recipe === recipe.number)[0] ?? null;
  const target = recipe.scenarios.filter((s) => s.name === (recipe.played ?? ''))[0] ?? recipe.scenarios[0];

  if (recipe.deferred || !script || !target) {
    p2.innerHTML =
      `<span class="mx-label">Why it isn't played</span>` +
      `<p class="mx-callout" style="margin:0 0 14px">${esc(recipe.deferred ?? 'No playback script.')}</p>` +
      `<p class="mx-dim" style="margin:0;font-size:14px">The inventory of what is deferred, with file pointers, is in ` +
      `<a href="${REPO}/blob/main/docs/DEFERRED.md">DEFERRED.md</a>.</p>`;
    if (target) {
      p2.appendChild(el('span', { class: 'mx-label', text: target.name, attrs: { style: 'display:block;margin:18px 0 8px' } }));
      p2.appendChild(stepList(target, null).ol);
    }
    bodyEl.appendChild(p2);
    card.appendChild(bodyEl);
    return card;
  }

  p2.appendChild(el('span', { class: 'mx-label', text: `Scenario · ${target.name}` }));
  const { ol, rows } = stepList(target, script);
  p2.appendChild(ol);
  const controls = el('div', { class: 'mx-row' });
  controls.style.marginTop = '14px';
  const play = el('button', { class: 'mx-btn on', html: `<span class="led"></span>Play`, attrs: { type: 'button' } });
  const stepBtn = el('button', { class: 'mx-btn', text: 'Step', attrs: { type: 'button' } });
  const resetBtn = el('button', { class: 'mx-btn', text: 'Reset', attrs: { type: 'button' } });
  const extra = el('button', { class: 'mx-btn', text: script.afterwards ? script.afterwards.label : '', attrs: { type: 'button' } });
  extra.hidden = true;
  controls.append(play, stepBtn, resetBtn, extra);
  p2.appendChild(controls);
  const where = el('p', { class: 'mx-dim', attrs: { style: 'margin:10px 0 0;font-size:13px' } });
  p2.appendChild(where);
  bodyEl.appendChild(p2);

  const live = el('div', { class: 'mx-bcard-live' });
  live.appendChild(el('span', { class: 'mx-label', text: 'The live mixer — these blocks, nothing else' }));
  const wide = script.blocks.indexOf('mx-mixwipe-block') !== -1;
  const bench = liveBench({ id: `bench-recipe-${recipe.number}`, blocks: script.blocks, bare: true, wide });
  live.appendChild(bench.root);
  bodyEl.appendChild(live);
  card.appendChild(bodyEl);

  wirePlayer(script, rows, bench.mixer, { play, stepBtn, resetBtn, extra, where });
  return card;
}

function wirePlayer(
  script: RecipeScript,
  rows: { li: HTMLElement; step: RecipeStep | null }[],
  mixer: MxMixer,
  ui: { play: HTMLElement; stepBtn: HTMLElement; resetBtn: HTMLElement; extra: HTMLElement; where: HTMLElement },
): void {
  // Run on the live mixer once it is up; without WebGPU, against a headless engine.
  let headless: PanelStore | null = null;
  let gpuMissing = false;
  const store = (): PanelStore => {
    const ctx = mixer.context;
    if (ctx) return ctx.store;
    if (!headless) headless = createEngine().store;
    return headless;
  };
  const describeTarget = (): void => {
    ui.where.textContent = mixer.context
      ? 'Running on the live mixer — drag any control afterwards.'
      : gpuMissing
        ? 'No WebGPU here, so the steps run against the headless engine (the same one CI uses) — the checks are real, the picture is not.'
        : 'The mixer starts when it scrolls into view; until then the steps run headlessly.';
  };
  mixer.addEventListener('mx-ready', describeTarget);
  mixer.addEventListener('mx-unavailable', () => {
    gpuMissing = true;
    describeTarget();
  });
  describeTarget();

  let index = 0;
  let timer = 0;
  const reset = (): void => {
    clearInterval(timer);
    timer = 0;
    index = 0;
    store().dispatch({ type: 'LOAD_STATE', state: factoryState() });
    for (const row of rows) row.li.className = '';
    for (const row of rows) row.li.querySelector('.res')!.textContent = '';
    ui.extra.hidden = true;
  };
  const stepOnce = (): boolean => {
    if (index >= rows.length) return false;
    const row = rows[index]!;
    if (index > 0) rows[index - 1]!.li.classList.remove('now');
    row.li.classList.add('now', 'done');
    const res = row.li.querySelector('.res')!;
    if (row.step) {
      for (const command of row.step.commands) store().dispatch(command);
      if (row.step.check) {
        const ok = row.step.check(store().getSnapshot());
        row.li.classList.add(ok ? 'pass' : 'fail');
        res.textContent = ok ? '✓' : '✗';
      }
    } else {
      res.textContent = '–';
    }
    index++;
    if (index >= rows.length) {
      ui.extra.hidden = !script.afterwards;
      return false;
    }
    return true;
  };

  ui.play.addEventListener('click', () => {
    reset();
    stepOnce();
    timer = window.setInterval(() => {
      if (!stepOnce()) {
        clearInterval(timer);
        timer = 0;
      }
    }, STEP_MS);
  });
  ui.stepBtn.addEventListener('click', () => {
    clearInterval(timer);
    timer = 0;
    if (index >= rows.length) reset();
    stepOnce();
  });
  ui.resetBtn.addEventListener('click', reset);
  ui.extra.addEventListener('click', () => {
    if (script.afterwards) for (const command of script.afterwards.commands) store().dispatch(command);
  });
}

void loadGenerated<RecipeJson[]>('recipes.json').then((recipes) => {
  if (!recipes) {
    listBody.innerHTML = `<p class="mx-dim">Recipes unavailable — run <code>npm run site:data</code>.</p>`;
    return;
  }
  for (let i = 0; i < recipes.length; i++) listBody.appendChild(recipeCard(recipes[i]!));
});
