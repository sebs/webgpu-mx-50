// Assembles the deployable static site into _site/ (docs/WEBSITE.md §7).
//
//   1. compile site/pages/*.ts AND src/main.ts with banira — one pass, no bundler. The
//      compiler follows relative imports, so _site ends up holding both site/ and src/
//      trees with their specifiers intact.
//   2. write a real index.html per route (deep links work on Pages with no 404 rewrite)
//   3. write app/index.html — the console itself, in its own document — and
//      music-video/index.html with its encoded footage
//   4. copy the generated JSON the pages fetch at runtime, and the committed captures
//      (bench stills + loops in site/posters/, the social card in site/assets/)
//
// SITE_URL (the deployed root, e.g. https://sebs.github.io/webgpu-mx-50 — the Pages workflow
// passes it from actions/configure-pages) turns on og:image: social cards need an absolute
// URL, and a relative one would be silently ignored, so without SITE_URL none is emitted.
//
// Run: npm run site:build   (site:data must have run first)

import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { ROUTES } from '../site/shell.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const OUT = join(ROOT, '_site');

/** Depth of a route path, for the relative path back to the site root. */
function upTo(path: string): string {
  if (!path) return './';
  const segments = path.split('/').filter(Boolean).length;
  let up = '';
  for (let i = 0; i < segments; i++) up += '../';
  return up;
}

const SITE_URL = (process.env.SITE_URL ?? '').replace(/\/+$/, '');
const SOCIAL_CARD = 'site/assets/social-card.jpg';

const CRITICAL_CSS = `
  :root { color-scheme: dark; }
  html, body { margin: 0; background: #0b0c14; color: #e9e9ed;
    font: 16px/1.6 system-ui, -apple-system, "Segoe UI", sans-serif; }
  .boot { max-width: 40rem; margin: 18vh auto; padding: 0 24px; color: #6f7386; }
  .boot strong { color: #e9e9ed; }
`;

function socialMeta(path: string): string {
  if (!SITE_URL || !existsSync(join(ROOT, SOCIAL_CARD))) return '';
  const image = `${SITE_URL}/${SOCIAL_CARD}`;
  return `<meta property="og:url" content="${escapeHtml(`${SITE_URL}/${path}`)}">
<meta property="og:image" content="${escapeHtml(image)}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="The web-mx-50 mixer mid-wipe, with the title: a 1990s broadcast mixer, rebuilt in the browser">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:image" content="${escapeHtml(image)}">
`;
}

function pageHtml(opts: { title: string; description: string; entry: string; up: string; path: string }): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(opts.title)}</title>
<meta name="description" content="${escapeHtml(opts.description)}">
<meta property="og:title" content="${escapeHtml(opts.title)}">
<meta property="og:description" content="${escapeHtml(opts.description)}">
<meta property="og:type" content="website">
${socialMeta(opts.path)}<link rel="icon" href="data:image/svg+xml,${encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="7" fill="#0b0c14"/><circle cx="16" cy="16" r="6" fill="#e2564d"/></svg>',
  )}">
<style>${CRITICAL_CSS}</style>
</head>
<body>
<noscript><div class="boot"><strong>web-mx-50</strong> — this page renders its demos with JavaScript
modules. The source is at <a href="https://github.com/sebs/webgpu-mx-50">github.com/sebs/webgpu-mx-50</a>.</div></noscript>
<script type="module" src="${opts.up}site/${opts.entry}"></script>
</body>
</html>
`;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function main(): void {
  if (existsSync(OUT)) rmSync(OUT, { recursive: true });
  mkdirSync(OUT, { recursive: true });

  // --- 1. compile
  const entries: string[] = [];
  for (let i = 0; i < ROUTES.length; i++) {
    entries.push('site/' + ROUTES[i]!.entry.replace(/\.js$/, '.ts'));
  }
  entries.push('src/main.ts'); // the console application itself
  entries.push('site/music-video/main.ts'); // the music video page

  process.stdout.write(`compiling ${entries.length} entries with banira…\n`);
  execFileSync('npx', ['banira', 'compile', ...entries, '--output', OUT], {
    cwd: ROOT,
    stdio: 'inherit',
  });

  // --- 2. one index.html per route
  for (let i = 0; i < ROUTES.length; i++) {
    const r = ROUTES[i]!;
    const dir = r.path ? join(OUT, r.path) : OUT;
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      join(dir, 'index.html'),
      pageHtml({ title: r.title, description: r.description, entry: r.entry, up: upTo(r.path), path: r.path }),
    );
  }

  // A 404 that still gives people the nav rather than a bare Pages error.
  writeFileSync(
    join(OUT, '404.html'),
    pageHtml({
      title: 'Not found — web-mx-50',
      description: 'That page does not exist.',
      entry: 'pages/overview.js',
      up: './',
      path: '',
    }),
  );

  // --- 3. the console document
  const appDir = join(OUT, 'app');
  mkdirSync(appDir, { recursive: true });
  const shell = readFileSync(join(ROOT, 'index.html'), 'utf8');
  // The repo shell loads ./src/main.js from the root; from _site/app/ that is one level up.
  writeFileSync(join(appDir, 'index.html'), shell.replace('./src/main.js', '../src/main.js'));

  // --- 3b. the music video document, one level down like the console; its footage beside it
  // (the page fetches video/web/ relative to itself). The proxies are encoded from the
  // committed originals by `npm run video:media`, which the Pages workflow runs first.
  const proxies = join(ROOT, 'video', 'web');
  if (!existsSync(proxies)) {
    throw new Error('video/web is missing — run `npm run video:media` first (needs ffmpeg)');
  }
  const videoDir = join(OUT, 'music-video');
  mkdirSync(videoDir, { recursive: true });
  const videoPage = readFileSync(join(ROOT, 'music-video.html'), 'utf8')
    .replace('./site/music-video/main.js', '../site/music-video/main.js')
    .replace('href="./index.html"', 'href="../app/"');
  writeFileSync(join(videoDir, 'index.html'), videoPage);
  cpSync(proxies, join(videoDir, 'video', 'web'), { recursive: true });
  // The music video files (video/*.json) the page loads by default or through ?video=.
  for (const name of readdirSync(join(ROOT, 'video'))) {
    if (name.endsWith('.json')) cpSync(join(ROOT, 'video', name), join(videoDir, 'video', name));
  }

  // --- 4. generated data + doc sources the pages fetch
  const gen = join(ROOT, 'site', 'generated');
  if (!existsSync(gen)) {
    throw new Error('site/generated is missing — run `npm run site:data` first');
  }
  const genOut = join(OUT, 'site', 'generated');
  mkdirSync(genOut, { recursive: true });
  cpSync(gen, genOut, { recursive: true });

  // Committed captures (scripts/capture-posters.mjs): bench stills and loops shown where WebGPU
  // is missing, and the social card.
  for (const dir of ['posters', 'assets']) {
    const from = join(ROOT, 'site', dir);
    if (existsSync(from)) cpSync(from, join(OUT, 'site', dir), { recursive: true });
  }

  // Pages must not run the output through Jekyll — it would drop nothing here today, but
  // an underscore-prefixed path later would vanish silently.
  writeFileSync(join(OUT, '.nojekyll'), '');

  process.stdout.write(`site built into _site/ (${ROUTES.length} routes + the console)\n`);
}

main();
