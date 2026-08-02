// Smoke test for the built site: walks every route's module graph and every fetched asset,
// and fails if anything a page needs is missing from _site/.
//
// The failure this guards against is the one a no-bundler ESM site is most exposed to — a
// relative specifier that typechecks but points at a file the build never emitted. Nothing
// catches that except resolving the graph the way a browser would.
//
// Run: npm run site:check   (after site:build)

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const OUT = join(ROOT, '_site');

const problems: string[] = [];
const visited: Record<string, true> = {};
let moduleCount = 0;

/** Every relative import/export specifier in a module. */
function specifiers(source: string): string[] {
  const found: string[] = [];
  const patterns = [
    /\bfrom\s*['"]([^'"]+)['"]/g,
    /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
    /\bimport\s*['"]([^'"]+)['"]/g,
  ];
  for (const re of patterns) {
    let m: RegExpExecArray | null;
    while ((m = re.exec(source)) !== null) {
      const spec = m[1]!;
      if (spec[0] === '.') found.push(spec);
    }
  }
  return found;
}

function walkModule(file: string, from: string): void {
  if (visited[file]) return;
  visited[file] = true;

  if (!existsSync(file)) {
    problems.push(`missing module: ${relative(OUT, file)}  (imported by ${relative(OUT, from)})`);
    return;
  }
  moduleCount++;
  const source = readFileSync(file, 'utf8');
  for (const spec of specifiers(source)) {
    walkModule(resolve(dirname(file), spec), file);
  }
}

/** Assets pages fetch at runtime rather than import. */
function checkFetchedAssets(): void {
  const required = [
    'site/generated/stats.json',
    'site/generated/scenarios.json',
    'site/generated/spine.json',
    'site/generated/adr.json',
    'site/generated/DEFERRED.md',
    'app/index.html',
    '404.html',
    '.nojekyll',
  ];
  for (const rel of required) {
    if (!existsSync(join(OUT, rel))) problems.push(`missing asset: ${rel}`);
  }

  // every ADR named in adr.json must have its markdown alongside
  const adrIndex = join(OUT, 'site/generated/adr.json');
  if (existsSync(adrIndex)) {
    const data = JSON.parse(readFileSync(adrIndex, 'utf8')) as { adrs: Array<{ file: string }> };
    for (const a of data.adrs) {
      if (!existsSync(join(OUT, 'site/generated/adr', a.file))) {
        problems.push(`missing ADR source: ${a.file}`);
      }
    }
  }
}

/** The console document must point at a main.js that exists. */
function checkAppShell(): void {
  const shell = join(OUT, 'app', 'index.html');
  if (!existsSync(shell)) return;
  const html = readFileSync(shell, 'utf8');
  const m = /<script[^>]+src="([^"]+)"/.exec(html);
  if (!m) {
    problems.push('app/index.html has no module script');
    return;
  }
  walkModule(resolve(join(OUT, 'app'), m[1]!), shell);
}

function main(): void {
  if (!existsSync(OUT)) {
    process.stderr.write('_site does not exist — run `npm run site:build` first\n');
    process.exit(1);
  }

  // Every route page: parse its script tag and walk from there.
  const pages: string[] = [];
  const walkDir = (dir: string): void => {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) walkDir(full);
      else if (entry === 'index.html' || entry === '404.html') pages.push(full);
    }
  };
  walkDir(OUT);

  for (const page of pages) {
    const html = readFileSync(page, 'utf8');
    const m = /<script[^>]+src="([^"]+)"/.exec(html);
    if (!m) {
      problems.push(`no module script in ${relative(OUT, page)}`);
      continue;
    }
    walkModule(resolve(dirname(page), m[1]!), page);
  }

  checkAppShell();
  checkFetchedAssets();

  process.stdout.write(`checked ${pages.length} pages, ${moduleCount} modules\n`);
  if (problems.length) {
    process.stderr.write(`\n${problems.length} problem(s):\n`);
    for (const p of problems) process.stderr.write(`  ✗ ${p}\n`);
    process.exit(1);
  }
  process.stdout.write('site check passed — every module and asset resolves\n');
}

main();
