// The site shell: route table, chrome (top bar / footer), and the small DOM helpers every
// page uses. There is no router — each route is a real directory with its own index.html
// and its own ESM entry (docs/WEBSITE.md §7.2: "ESM modules per route, no bundle"), so
// deep links work on GitHub Pages without a 404 rewrite.
//
// Every URL on the site is derived from `import.meta.url`, so the whole thing works
// unchanged at a domain root or under a project path like /webgpu-mx-50/.

import { ensureTheme } from '../src/ui/theme.js';
import { ensureSiteStyles } from './site-css.js';

export interface RouteDef {
  /** Path below the site root, '' for the overview. Always ends with '/' when non-empty. */
  readonly path: string;
  /** Entry module below site/, e.g. 'pages/overview.js'. */
  readonly entry: string;
  readonly title: string;
  /** Shown in the top nav when true. */
  readonly nav: boolean;
  /** Short nav label. */
  readonly navLabel?: string;
  readonly description: string;
}

export const ROUTES: readonly RouteDef[] = [
  {
    path: '',
    entry: 'pages/overview.js',
    title: 'web-mx-50 — a 1990s broadcast mixer, rebuilt in the browser',
    nav: false,
    description:
      'A WebGPU browser recreation of the Panasonic WJ-MX50 two-bus digital A/V mixer, in vanilla TypeScript with no framework and no bundler.',
  },
  {
    path: 'machine/',
    entry: 'pages/machine.js',
    title: 'The Machine — web-mx-50',
    nav: true,
    navLabel: 'The Machine',
    description: 'Every block of the mixer, described and running: source, colour correction, effects, mix/wipe, DSK, fade.',
  },
  {
    path: 'machine/wipes/',
    entry: 'pages/wipes.js',
    title: 'The wipe engine — web-mx-50',
    nav: false,
    description: 'Seven wipe families, four variants each, composed with modifiers — plus the RS-422 pattern numbering oracle.',
  },
  {
    path: 'machine/audio-memory-control/',
    entry: 'pages/audio-memory-control.js',
    title: 'Audio, Memory & Control — web-mx-50',
    nav: false,
    description: 'The blocks that sit off the video signal path: the audio mixer, Event Memory, Special Modes, and inputs.',
  },
  {
    path: 'architecture/',
    entry: 'pages/architecture.js',
    title: 'Architecture — web-mx-50',
    nav: true,
    navLabel: 'Architecture',
    description:
      'State store, signal graph, fixed-timestep clock, WebGPU render path, headless test layer, and the no-bundler build.',
  },
  {
    path: 'console/',
    entry: 'pages/console.js',
    title: 'The console — web-mx-50',
    nav: false,
    description: 'Run the mixer: the real application, full-bleed, with the control map and things to try.',
  },
];

/** The deployed site root, derived from this module's own URL (site/shell.js → ../). */
export function siteRoot(): string {
  return new URL('../', import.meta.url).href;
}

/** Absolute href for a route path ('' = overview). */
export function href(path: string): string {
  return new URL(path, siteRoot()).href;
}

/** Fetch a JSON artifact from site/generated/ (see scripts/site-data.ts). */
export async function loadGenerated<T>(name: string): Promise<T | null> {
  try {
    const res = await fetch(new URL('site/generated/' + name, siteRoot()).href);
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------- DOM helpers

/** Create an element with optional class, text, and attributes. */
export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  opts: { class?: string; text?: string; html?: string; attrs?: Record<string, string> } = {},
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (opts.class) node.className = opts.class;
  if (opts.text !== undefined) node.textContent = opts.text;
  if (opts.html !== undefined) node.innerHTML = opts.html;
  if (opts.attrs) {
    const keys = Object.keys(opts.attrs);
    for (let i = 0; i < keys.length; i++) node.setAttribute(keys[i]!, opts.attrs[keys[i]!]!);
  }
  return node;
}

/** Escape text for interpolation into an innerHTML template. */
export function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** ES2015-safe membership test — banira's compile lib floor predates Array.includes. */
export function has<T>(list: readonly T[], value: T): boolean {
  return list.indexOf(value) !== -1;
}

/** A GitHub source link for a repo-relative path. */
export const REPO = 'https://github.com/sebs/webgpu-mx-50';
export function srcLink(path: string, label?: string): string {
  return `<a href="${REPO}/blob/main/${esc(path)}"><code>${esc(label ?? path)}</code></a>`;
}

// ---------------------------------------------------------------- chrome

export interface ShellOptions {
  /** Route path this page represents, for nav highlighting. */
  readonly route: string;
}

/**
 * Inject styles, render the top bar and footer, and hand back the <main> element pages
 * fill in. Called once per page module.
 */
export function mountShell(opts: ShellOptions): HTMLElement {
  ensureTheme();
  ensureSiteStyles();
  document.body.classList.add('mx-site');

  const skip = el('a', { class: 'mx-skip', text: 'Skip to content', attrs: { href: '#content' } });
  document.body.appendChild(skip);

  // --- top bar
  const bar = el('header', { class: 'mx-topbar' });
  const barInner = el('div', { class: 'mx-wrap mx-topbar-inner' });

  const mark = el('a', { class: 'mx-wordmark', attrs: { href: href('') } });
  mark.innerHTML = `<span class="dot" aria-hidden="true"></span><span>web-mx-50</span>`;
  barInner.appendChild(mark);

  const nav = el('nav', { class: 'mx-nav', attrs: { 'aria-label': 'Main' } });
  for (let i = 0; i < ROUTES.length; i++) {
    const r = ROUTES[i]!;
    if (!r.nav) continue;
    const a = el('a', { text: r.navLabel ?? r.title, attrs: { href: href(r.path) } });
    if (r.path === opts.route) a.setAttribute('aria-current', 'page');
    nav.appendChild(a);
  }
  const cta = el('a', { class: 'mx-cta', attrs: { href: href('console/') } });
  cta.innerHTML = `<span class="led" aria-hidden="true"></span>Launch console`;
  nav.appendChild(cta);
  barInner.appendChild(nav);

  bar.appendChild(barInner);
  document.body.appendChild(bar);

  // --- main
  const main = el('main', { attrs: { id: 'content' } });
  document.body.appendChild(main);

  // --- footer
  const footer = el('footer', { class: 'mx-footer' });
  const fInner = el('div', { class: 'mx-wrap mx-footer-cols' });
  // The source link is not decoration: this site serves the console over a network, and
  // AGPL-3.0 §13 requires that users interacting with it remotely be offered its source.
  // Keep the licence and repository link on every page.
  fInner.innerHTML = `
    <div style="max-width:46ch">
      <p style="margin:0 0 8px"><strong>web-mx-50</strong> — a proof of concept.
      Not affiliated with, endorsed by, or connected to Panasonic; "WJ-MX50" names the
      hardware this project studies.</p>
      <p style="margin:0"><a href="${REPO}/blob/main/docs/DEFERRED.md">Here is what isn't built &rarr;</a></p>
    </div>
    <div>
      <p class="mx-label" style="margin:0 0 8px">Source &amp; licence</p>
      <p style="margin:0 0 6px"><a href="${REPO}">github.com/sebs/webgpu-mx-50</a></p>
      <p style="margin:0"><a href="${REPO}/blob/main/LICENSE">GNU AGPL v3.0</a>
      <span class="mx-dim">— including the complete source of this site and of the console it serves.</span></p>
    </div>`;
  footer.appendChild(fInner);
  document.body.appendChild(footer);

  return main;
}

/** A `<section>` with the site's standard heading rhythm. */
export function section(opts: { label?: string; title?: string; id?: string }): HTMLElement {
  const s = el('section', { class: 'mx-section' });
  if (opts.id) s.id = opts.id;
  const wrap = el('div', { class: 'mx-wrap' });
  if (opts.label || opts.title) {
    const head = el('div', { class: 'mx-section-head' });
    if (opts.label) head.appendChild(el('span', { class: 'mx-label', text: opts.label }));
    if (opts.title) head.appendChild(el('h2', { text: opts.title }));
    wrap.appendChild(head);
  }
  s.appendChild(wrap);
  return s;
}

/** The inner .mx-wrap of a section built by `section()`. */
export function body(sectionEl: HTMLElement): HTMLElement {
  return sectionEl.querySelector('.mx-wrap') as HTMLElement;
}

export interface BlockCardSpec {
  readonly title: string;
  /** e.g. 'B-1' — the hardware's own block letter. */
  readonly block?: string;
  /** Manual section citation, e.g. 'reference §3'. */
  readonly cite?: string;
  /** Pane 1: what the hardware does. HTML. */
  readonly hardware: string;
  /** Pane 3: what's modelled. HTML. */
  readonly modelled: string;
  /** Pane 2: the demo element (custom-element tag name), or null for description-only. */
  readonly demo?: string;
  /** Pane 4: the spec that pins it. */
  readonly spec?: { readonly feature: string; readonly scenario: string };
  /** Source files to link under "modelled". */
  readonly sources?: readonly string[];
}

/**
 * The repeating four-pane content unit (docs/WEBSITE.md §2): hardware description and a
 * live demo above, the modelled rules and the pinning scenario below.
 */
export function blockCard(spec: BlockCardSpec): HTMLElement {
  const card = el('article', { class: 'mx-panel mx-block' });

  const head = el('div', { class: 'mx-block-head' });
  head.appendChild(el('h3', { text: spec.title }));
  const chips = el('div', { class: 'mx-chips' });
  if (spec.block) chips.appendChild(el('span', { class: 'mx-chip', text: spec.block }));
  if (spec.cite) chips.appendChild(el('span', { class: 'mx-chip', text: spec.cite }));
  head.appendChild(chips);
  card.appendChild(head);

  const bodyEl = el('div', { class: 'mx-block-body' });

  const p1 = el('div', { class: 'mx-pane' });
  p1.innerHTML = `<span class="mx-label">What the hardware does</span><div class="mx-prose">${spec.hardware}</div>`;
  bodyEl.appendChild(p1);

  const p2 = el('div', { class: 'mx-pane mx-pane-demo' });
  if (spec.demo) {
    p2.innerHTML = `<span class="mx-label">The demo — live, keyboard-operable</span>`;
    p2.appendChild(document.createElement(spec.demo));
  } else {
    p2.innerHTML =
      `<span class="mx-label">The demo</span>` +
      `<p class="mx-dim" style="margin:0">This block ships description-only for now; its bench needs WebGPU ` +
      `and lands with the Tier-1 pass. The renderer already draws it — what's missing is the harness. ` +
      `<a href="${REPO}/blob/main/docs/WEBSITE.md">The plan is in the repo.</a></p>`;
  }
  bodyEl.appendChild(p2);

  const p3 = el('div', { class: 'mx-pane' });
  let srcHtml = '';
  if (spec.sources && spec.sources.length) {
    const links: string[] = [];
    for (let i = 0; i < spec.sources.length; i++) links.push(srcLink(spec.sources[i]!));
    srcHtml = `<p class="mx-dim" style="margin-top:12px">${links.join(' · ')}</p>`;
  }
  p3.innerHTML = `<span class="mx-label">What's modelled</span><div class="mx-prose">${spec.modelled}</div>${srcHtml}`;
  bodyEl.appendChild(p3);

  const p4 = el('div', { class: 'mx-pane' });
  if (spec.spec) {
    p4.innerHTML =
      `<span class="mx-label">The spec that pins it</span>` +
      `<p style="margin:0 0 8px"><code>${esc(spec.spec.scenario)}</code></p>` +
      `<p class="mx-dim" style="margin:0">A real Gherkin scenario, executed headlessly against this code in CI — ` +
      `read it in ${srcLink('features/' + spec.spec.feature)}.</p>`;
  } else {
    p4.innerHTML =
      `<span class="mx-label">The spec that pins it</span>` +
      `<p class="mx-dim" style="margin:0">The behaviour contract lives in ` +
      `<a href="${REPO}/tree/main/features">features/</a>.</p>`;
  }
  bodyEl.appendChild(p4);

  card.appendChild(bodyEl);
  return card;
}
