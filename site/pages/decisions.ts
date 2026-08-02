// Route: /decisions/
//
// The ADR index from adr.json, with each record's full markdown fetched on demand. The
// metadata is parsed from each file's H1 plus its Status/Date/Deciders bullet block — the
// convention ADR-0001 itself establishes. There is no YAML front matter in these files and
// the generator does not pretend otherwise.

import { mountShell, section, body, el, esc, srcLink, siteRoot } from '../shell.js';
import { loadGenerated } from '../shell.js';
import { renderMarkdown } from '../markdown.js';

interface AdrRecord {
  id: string;
  number: number;
  file: string;
  title: string;
  status: string;
  date: string;
  deciders: string;
  stages: string[];
  summary: string;
}

const main = mountShell({ route: 'decisions/' });

const intro = el('section');
intro.style.padding = '64px 0 8px';
const introWrap = el('div', { class: 'mx-wrap' });
introWrap.innerHTML = `
  <span class="mx-label">Decisions</span>
  <h1 style="margin:14px 0 18px;max-width:24ch">The choices that hold everything else up.</h1>
  <p class="mx-prose" style="font-size:17px;color:var(--mx-label);max-width:62ch">
    Architecture decision records, in the repo, written when the decision was made rather than
    reconstructed afterwards. They are the reason the rest of the project is legible: WebGPU over
    canvas, no framework and no bundler, a fixed signal graph, one store, a fixed-timestep clock,
    and a testing strategy that puts the manual in charge.
  </p>`;
intro.appendChild(introWrap);
main.appendChild(intro);

const listSection = section({});
const listBody = body(listSection);
main.appendChild(listSection);

void loadGenerated<{ adrs: AdrRecord[] }>('adr.json').then((data) => {
  if (!data) {
    listBody.innerHTML = `<p class="mx-dim">ADR data unavailable — run <code>npm run site:data</code>.</p>`;
    return;
  }

  for (let i = 0; i < data.adrs.length; i++) {
    const adr = data.adrs[i]!;
    const card = el('article', { class: 'mx-panel' });
    card.style.marginBottom = '14px';
    card.style.overflow = 'hidden';

    const statusClass = /accepted/i.test(adr.status) ? 'ok' : /superseded|deprecated/i.test(adr.status) ? 'live' : '';

    const details = document.createElement('details');
    const summary = document.createElement('summary');
    summary.style.cssText = 'cursor:pointer;padding:16px 22px;display:flex;gap:12px;align-items:baseline;flex-wrap:wrap';
    summary.innerHTML =
      `<span class="mx-readout" style="font-size:12px;padding:3px 8px">${esc(adr.id)}</span>` +
      `<strong style="flex:1 1 20rem">${esc(adr.title)}</strong>` +
      `<span class="mx-chip ${statusClass}"><span class="led"></span>${esc(adr.status)}</span>` +
      (adr.date ? `<span class="mx-dim" style="font-size:12px">${esc(adr.date)}</span>` : '');
    details.appendChild(summary);

    const content = document.createElement('div');
    content.style.cssText = 'padding:0 22px 20px;border-top:1px solid var(--mx-line)';
    content.innerHTML = `<p class="mx-dim" style="margin:16px 0">Loading…</p>`;
    details.appendChild(content);

    let loaded = false;
    details.addEventListener('toggle', () => {
      if (!details.open || loaded) return;
      loaded = true;
      void fetch(new URL('site/generated/adr/' + adr.file, siteRoot()).href)
        .then((r) => (r.ok ? r.text() : Promise.reject(new Error(String(r.status)))))
        .then((md) => {
          content.innerHTML = `<div class="mx-prose" style="max-width:none">${renderMarkdown(md)}</div>`;
          const link = document.createElement('p');
          link.className = 'mx-dim';
          link.innerHTML = srcLink('adr/' + adr.file, 'view on GitHub');
          content.appendChild(link);
        })
        .catch(() => {
          content.innerHTML =
            `<p class="mx-dim" style="margin:16px 0">Could not load the record. ` +
            `${srcLink('adr/' + adr.file, 'read it on GitHub')}</p>`;
        });
    });

    card.appendChild(details);
    listBody.appendChild(card);
  }

  const note = el('p', { class: 'mx-prose mx-dim' });
  note.style.marginTop = '24px';
  note.innerHTML =
    `Records are indexed from each file's title and its <code>Status</code> / <code>Date</code> /
     <code>Deciders</code> bullets — the format ADR-0001 sets out. A per-ADR mapping to signal-graph
     stages would let this page filter by block; no such field exists in the records yet, so the
     filter is deliberately absent rather than faked from a hand-written table.`;
  listBody.appendChild(note);
});
