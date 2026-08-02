// Route: /specs/
//
// The page that makes the fidelity claim checkable: every scenario in features/, grouped,
// filterable, searchable, and — the part that matters — marked with whether it actually
// executes in the CI gate. Blurring authored and executed would be exactly the kind of
// flattering imprecision this project's docs avoid.

import { mountShell, section, body, el, esc, srcLink, has } from '../shell.js';
import { loadGenerated } from '../shell.js';

interface ScenarioRecord {
  feature: string;
  featureName: string;
  rule: string | null;
  name: string;
  keyword: string;
  tags: string[];
  steps: string[];
  examples: number;
  executed: boolean;
  line: number;
}

const main = mountShell({ route: 'specs/' });

const intro = el('section');
intro.style.padding = '64px 0 8px';
const introWrap = el('div', { class: 'mx-wrap' });
introWrap.innerHTML = `
  <span class="mx-label">The living specification</span>
  <h1 style="margin:14px 0 18px;max-width:24ch">Every scenario, and whether it runs.</h1>
  <p class="mx-prose" style="font-size:17px;color:var(--mx-label);max-width:64ch">
    These Gherkin files are the authoritative statement of what each block does, written from the
    hardware's operating manual. They are not documentation beside the code — they execute against
    the real domain modules, headlessly, with no GPU and no DOM. When behaviour and code disagree,
    the feature file wins.
  </p>
  <div id="spec-summary"></div>`;
intro.appendChild(introWrap);
main.appendChild(intro);

const browser = section({});
const browserBody = body(browser);
main.appendChild(browser);

const controls = el('div', { class: 'mx-panel mx-card' });
controls.style.marginBottom = '20px';
controls.innerHTML = `
  <div class="mx-row" style="gap:14px;align-items:flex-end">
    <label class="mx-field" style="flex:1 1 22rem">
      <span>Search scenario text</span>
      <input class="mx-input" type="text" id="spec-q" placeholder="chroma, blink, 510 frames, substitute…">
    </label>
    <label class="mx-field">
      <span>Show</span>
      <select class="mx-input" id="spec-exec">
        <option value="all">All scenarios</option>
        <option value="yes">Executed in CI only</option>
        <option value="no">Not executed only</option>
      </select>
    </label>
    <label class="mx-field">
      <span>Tag</span>
      <select class="mx-input" id="spec-tag"><option value="">Any</option></select>
    </label>
  </div>
  <div id="spec-count" class="mx-dim" style="margin-top:12px;font-size:13px"></div>`;
browserBody.appendChild(controls);

const list = el('div', { attrs: { id: 'spec-list' } });
browserBody.appendChild(list);

void loadGenerated<{ scenarios: ScenarioRecord[] }>('scenarios.json').then((data) => {
  if (!data) {
    list.innerHTML = `<p class="mx-dim">Scenario data unavailable — run <code>npm run site:data</code>.</p>`;
    return;
  }
  const all = data.scenarios;

  let authored = 0;
  let executed = 0;
  const tagSet: string[] = [];
  for (let i = 0; i < all.length; i++) {
    authored += all[i]!.examples;
    if (all[i]!.executed) executed += all[i]!.examples;
    for (let t = 0; t < all[i]!.tags.length; t++) if (!has(tagSet, all[i]!.tags[t]!)) tagSet.push(all[i]!.tags[t]!);
  }
  tagSet.sort();

  const summary = document.getElementById('spec-summary')!;
  summary.innerHTML = `
    <div class="mx-row" style="gap:10px;margin-top:22px">
      <span class="mx-chip ok"><span class="led"></span>${executed} execute in the gate</span>
      <span class="mx-chip"><span class="led"></span>${authored - executed} authored, deferred</span>
      <span class="mx-chip"><span class="led"></span>${authored} total</span>
    </div>
    <p class="mx-prose mx-dim" style="max-width:64ch;margin-top:14px">
      The gap is deliberate and enumerated: interlace behaviour that has no analogue in a
      full-resolution progressive build, a handful of scenarios whose data cannot be derived from the
      reference without mining the pattern table, and cross-feature recipes that would contradict a
      tested invariant. Every one of them is filterable below.
    </p>`;

  const tagSel = document.getElementById('spec-tag') as HTMLSelectElement;
  for (let i = 0; i < tagSet.length; i++) {
    const o = document.createElement('option');
    o.value = tagSet[i]!;
    o.textContent = tagSet[i]!;
    tagSel.appendChild(o);
  }

  const qInput = document.getElementById('spec-q') as HTMLInputElement;
  const execSel = document.getElementById('spec-exec') as HTMLSelectElement;
  const countEl = document.getElementById('spec-count')!;

  // Deep links from block cards: /specs/?q=<scenario name>
  const params = new URLSearchParams(window.location.search);
  const initialQ = params.get('q');
  if (initialQ) qInput.value = initialQ;

  const render = (): void => {
    const q = qInput.value.trim().toLowerCase();
    const execMode = execSel.value;
    const tag = tagSel.value;

    const matched: ScenarioRecord[] = [];
    for (let i = 0; i < all.length; i++) {
      const r = all[i]!;
      if (execMode === 'yes' && !r.executed) continue;
      if (execMode === 'no' && r.executed) continue;
      if (tag && !has(r.tags, tag)) continue;
      if (q) {
        const hay = (r.name + ' ' + r.feature + ' ' + (r.rule ?? '') + ' ' + r.steps.join(' ')).toLowerCase();
        if (hay.indexOf(q) === -1) continue;
      }
      matched.push(r);
    }

    let shown = 0;
    for (let i = 0; i < matched.length; i++) shown += matched[i]!.examples;
    countEl.innerHTML =
      `Showing <strong>${matched.length}</strong> scenario blocks (<strong>${shown}</strong> after example expansion) ` +
      `of ${all.length} · ${authored} authored in total.`;

    // group by feature file
    const byFeature: Record<string, ScenarioRecord[]> = {};
    const order: string[] = [];
    for (let i = 0; i < matched.length; i++) {
      const f = matched[i]!.feature;
      if (!byFeature[f]) {
        byFeature[f] = [];
        order.push(f);
      }
      byFeature[f]!.push(matched[i]!);
    }

    if (!order.length) {
      list.innerHTML = `<p class="mx-dim">Nothing matches that filter.</p>`;
      return;
    }

    const blocks: string[] = [];
    for (let i = 0; i < order.length; i++) {
      const f = order[i]!;
      const items = byFeature[f]!;
      const rows: string[] = [];
      for (let j = 0; j < items.length; j++) {
        const r = items[j]!;
        const tagChips: string[] = [];
        for (let t = 0; t < r.tags.length; t++)
          tagChips.push(`<span class="mx-chip">${esc(r.tags[t]!)}</span>`);
        const steps: string[] = [];
        for (let s = 0; s < r.steps.length; s++)
          steps.push(`<div style="padding:1px 0"><span class="mx-dim">${esc(r.steps[s]!.split(' ')[0] ?? '')}</span> ${esc(r.steps[s]!.split(' ').slice(1).join(' '))}</div>`);
        rows.push(`
          <details style="border-top:1px solid var(--mx-line);padding:10px 22px">
            <summary style="cursor:pointer;display:flex;gap:10px;align-items:baseline;flex-wrap:wrap">
              <span class="mx-chip ${r.executed ? 'ok' : ''}" title="${r.executed ? 'Executes in the CI gate' : 'Authored but not executed'}">
                <span class="led"></span>${r.executed ? 'runs' : 'deferred'}</span>
              <span>${esc(r.name)}</span>
              ${r.examples > 1 ? `<span class="mx-dim" style="font-size:12px">${r.examples} examples</span>` : ''}
              ${tagChips.join('')}
            </summary>
            <div class="mono" style="margin:10px 0 4px;font-size:12.5px;line-height:1.6;color:var(--mx-label)">
              ${r.rule ? `<div class="mx-label" style="margin-bottom:6px">Rule: ${esc(r.rule)}</div>` : ''}
              ${steps.join('')}
            </div>
          </details>`);
      }
      blocks.push(`
        <article class="mx-panel" style="margin-bottom:18px;overflow:hidden">
          <div class="mx-block-head">
            <h3 style="margin:0"><code>${esc(f)}</code></h3>
            <span class="mx-dim">${esc(items[0]!.featureName)}</span>
          </div>
          ${rows.join('')}
          <div style="padding:10px 22px;border-top:1px solid var(--mx-line)" class="mx-dim">
            ${srcLink('features/' + f, 'view on GitHub')}
          </div>
        </article>`);
    }
    list.innerHTML = blocks.join('');
  };

  qInput.addEventListener('input', render);
  execSel.addEventListener('change', render);
  tagSel.addEventListener('change', render);
  render();
});

// ---------------------------------------------------------------- replay note

const replay = section({ label: 'Still to come', title: 'Replaying a scenario in the browser' });
body(replay).appendChild(
  el('div', {
    class: 'mx-prose',
    html:
      `<p>The natural next step for this page is a ▶ button on every scenario that re-runs its steps
       against the live reducer here in the page. It is genuinely buildable — the domain is DOM-free
       and GPU-free, so the same code that runs in CI runs in a tab — but it is not free, and it is
       worth being precise about why.</p>
      <p>A Cucumber formatter cannot see which commands a step dispatched or which assertions it
       made; that data does not exist at the formatter layer. Making replay real means instrumenting
       the test World to record, per step, the commands dispatched and a hash of the resulting
       snapshot — then replaying that journal against the reducer and diffing the hashes. Steps that
       assert on a pure function's return value rather than on state would show their
       <em>recorded</em> result, clearly marked as such.</p>
      <p class="mx-dim">Until that exists, this page shows the specs and their execution status
       honestly, and does not pretend the green chips were computed in your browser — they come from
       the CI run that gates this deployment.</p>`,
  }),
);
main.appendChild(replay);
