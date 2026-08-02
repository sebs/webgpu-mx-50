// Route: /status/
//
// Renders docs/DEFERRED.md as published, plus an honest account of this site's own gaps.
// Putting this in the main navigation rather than burying it is deliberate: for the
// engineer audience an accurate deferred inventory is a stronger signal than a longer
// feature list.

import { mountShell, section, body, el, srcLink, siteRoot, href } from '../shell.js';
import { renderMarkdown } from '../markdown.js';

const main = mountShell({ route: 'status/' });

const intro = el('section');
intro.style.padding = '64px 0 8px';
const introWrap = el('div', { class: 'mx-wrap' });
introWrap.innerHTML = `
  <span class="mx-label">Status</span>
  <h1 style="margin:14px 0 18px;max-width:26ch">What's built, what isn't, and why.</h1>
  <p class="mx-prose" style="font-size:17px;color:var(--mx-label);max-width:64ch">
    The domain model is complete and verified headlessly, and the GPU passes render the signal path.
    What remains is inventoried below — straight from the repo's own deferral document, unedited —
    in four kinds: work that landed, one environment limit, things that would break a tested
    invariant, and things deliberately out of scope.
  </p>`;
intro.appendChild(introWrap);
main.appendChild(intro);

// ---------------------------------------------------------------- this site

const siteStatus = section({ label: 'This website', title: 'What this site does not yet do' });
body(siteStatus).appendChild(
  el('div', {
    class: 'mx-prose',
    html:
      `<p>The site is built in phases, and it is currently missing two things worth naming plainly
       rather than letting you discover them as dead ends:</p>
      <ul>
        <li><strong>The WebGPU benches.</strong> Colour Correction, the Digital Effect rack, the wipe
        wall, the DSK and the Fade stage ship <em>description-only</em> today. The renderer draws all
        of it already — what is missing is site-side harness work: splitting device acquisition from
        canvas configuration so several benches can share one GPU device, extracting the procedural
        feed patterns out of the console's monitor wall, and wiring visibility-based pausing.</li>
        <li><strong>Scenario replay.</strong> The <a href="${href('specs/')}">specs page</a> browses
        and filters, but does not yet re-run a scenario in your browser. That needs the test World
        instrumented to record per-step command journals — see the note at the foot of that page for
        exactly what is and is not possible there.</li>
      </ul>
      <p>Everything else on the site — every demo you can operate — calls the shipping domain code
      directly. None of them reimplement a rule, and none of them are mock-ups.</p>`,
  }),
);
main.appendChild(siteStatus);

// ---------------------------------------------------------------- DEFERRED.md

const deferred = section({ label: 'From the repository', title: 'Deferred work & known limitations' });
const deferredBody = body(deferred);
const target = el('div', { class: 'mx-prose' });
target.style.maxWidth = 'none';
target.innerHTML = `<p class="mx-dim">Loading the deferral inventory…</p>`;
deferredBody.appendChild(target);
main.appendChild(deferred);

void fetch(new URL('site/generated/DEFERRED.md', siteRoot()).href)
  .then((r) => (r.ok ? r.text() : Promise.reject(new Error(String(r.status)))))
  .then((md) => {
    target.innerHTML = renderMarkdown(md);
    const src = document.createElement('p');
    src.className = 'mx-dim';
    src.innerHTML = `Rendered verbatim from ${srcLink('docs/DEFERRED.md')}.`;
    target.appendChild(src);
  })
  .catch(() => {
    target.innerHTML =
      `<p class="mx-dim">Could not load the inventory. ${srcLink('docs/DEFERRED.md', 'read it on GitHub')}.</p>`;
  });
