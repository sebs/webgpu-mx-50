// Assembles the deployable static site into _site/ (docs/WEBSITE.md §7).
//
//   1. compile site/pages/*.ts AND src/main.ts with banira — one pass, no bundler. The
//      compiler follows relative imports, so _site ends up holding both site/ and src/
//      trees with their specifiers intact.
//   2. write a real index.html per route (deep links work on Pages with no 404 rewrite)
//   3. write app/index.html — the console itself, in its own document
//   4. copy the generated JSON the pages fetch at runtime
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

const CRITICAL_CSS = `
  :root { color-scheme: dark; }
  html, body { margin: 0; background: #0b0c14; color: #e9e9ed;
    font: 16px/1.6 system-ui, -apple-system, "Segoe UI", sans-serif; }
  .boot { max-width: 40rem; margin: 18vh auto; padding: 0 24px; color: #6f7386; }
  .boot strong { color: #e9e9ed; }
`;

function pageHtml(opts: { title: string; description: string; entry: string; up: string }): string {
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
<link rel="icon" href="data:image/svg+xml,${encodeURIComponent(
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
      pageHtml({ title: r.title, description: r.description, entry: r.entry, up: upTo(r.path) }),
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
    }),
  );

  // --- 3. the console document
  const appDir = join(OUT, 'app');
  mkdirSync(appDir, { recursive: true });
  const shell = readFileSync(join(ROOT, 'index.html'), 'utf8');
  // The repo shell loads ./src/main.js from the root; from _site/app/ that is one level up.
  writeFileSync(join(appDir, 'index.html'), shell.replace('./src/main.js', '../src/main.js'));

  // --- 4. generated data + doc sources the pages fetch
  const gen = join(ROOT, 'site', 'generated');
  if (!existsSync(gen)) {
    throw new Error('site/generated is missing — run `npm run site:data` first');
  }
  const genOut = join(OUT, 'site', 'generated');
  mkdirSync(genOut, { recursive: true });
  cpSync(gen, genOut, { recursive: true });

  // Pages must not run the output through Jekyll — it would drop nothing here today, but
  // an underscore-prefixed path later would vanish silently.
  writeFileSync(join(OUT, '.nojekyll'), '');

  process.stdout.write(`site built into _site/ (${ROUTES.length} routes + the console)\n`);
}

main();
