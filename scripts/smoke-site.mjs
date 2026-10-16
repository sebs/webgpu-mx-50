// Loads every built route in headless Chrome over a real HTTP server and fails on any
// console error, page error, or failed request. This is the check that catches what static
// analysis cannot: a demo that throws while rendering, a custom element that never upgrades,
// a fetch that 404s at runtime.
//
// Run: npm run site:smoke   (after site:build). Locally it skips if no Chrome is present; in CI
// (CI=true, which GitHub Actions sets) a missing Chrome FAILS — a skipped smoke test would let
// the deploy gate pass while checking nothing, e.g. on a runner image that stopped shipping it.

import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn, execFileSync } from 'node:child_process';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, '_site');

const ROUTES = [
  '/',
  '/learn/',
  '/machine/',
  '/machine/wipes/',
  '/machine/recipes/',
  '/machine/audio-memory-control/',
  '/architecture/',
  '/embed/',
  '/console/',
];

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.map': 'application/json',
  '.svg': 'image/svg+xml',
  '.jpg': 'image/jpeg',
  '.webm': 'video/webm',
};

function findChrome() {
  const candidates = [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
    process.env.CHROME_PATH,
  ].filter(Boolean);
  for (const c of candidates) if (existsSync(c)) return c;
  try {
    return execFileSync('which', ['google-chrome'], { encoding: 'utf8' }).trim() || null;
  } catch {
    return null;
  }
}

function serve() {
  const server = createServer((req, res) => {
    let path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    let file = join(OUT, path);
    if (existsSync(file) && statSync(file).isDirectory()) file = join(file, 'index.html');
    if (!existsSync(file)) {
      res.writeHead(404, { 'content-type': 'text/plain' });
      res.end('not found');
      return;
    }
    res.writeHead(200, { 'content-type': MIME[extname(file)] ?? 'application/octet-stream' });
    res.end(readFileSync(file));
  });
  return new Promise((r) => server.listen(0, '127.0.0.1', () => r(server)));
}

async function cdp(port, sessionFn) {
  const listRes = await fetch(`http://127.0.0.1:${port}/json/list`);
  const targets = await listRes.json();
  const target = targets.find((t) => t.type === 'page');
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((r, j) => {
    ws.onopen = r;
    ws.onerror = j;
  });
  let id = 0;
  const pending = new Map();
  const listeners = [];
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      pending.get(msg.id)(msg.result);
      pending.delete(msg.id);
    } else if (msg.method) {
      for (const l of listeners) l(msg);
    }
  };
  const send = (method, params = {}) =>
    new Promise((r) => {
      const myId = ++id;
      pending.set(myId, r);
      ws.send(JSON.stringify({ id: myId, method, params }));
    });
  const on = (fn) => listeners.push(fn);
  try {
    return await sessionFn({ send, on });
  } finally {
    ws.close();
  }
}

async function main() {
  const chrome = findChrome();
  if (!chrome) {
    if (process.env.CI) {
      console.error('no Chrome found in CI — the smoke test cannot run, so the gate must not pass (set CHROME_PATH or install Chrome)');
      process.exit(1);
    }
    console.log('no Chrome found — skipping browser smoke test');
    return;
  }
  // Name the browser in the log: a runner-image change shows up here before it shows up as a failure.
  try {
    console.log(`using ${execFileSync(chrome, ['--version'], { encoding: 'utf8' }).trim()} (${chrome})`);
  } catch {
    console.log(`using ${chrome}`);
  }
  if (!existsSync(OUT)) {
    console.error('_site missing — run `npm run site:build`');
    process.exit(1);
  }

  const server = await serve();
  const base = `http://127.0.0.1:${server.address().port}`;
  const port = 9222 + (process.pid % 500);
  const proc = spawn(
    chrome,
    [
      '--headless=new',
      `--remote-debugging-port=${port}`,
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-gpu',
      '--window-size=1280,900',
      '--user-data-dir=' + join(ROOT, 'node_modules', '.cache', 'smoke-profile'),
      'about:blank',
    ],
    { stdio: 'ignore' },
  );

  // wait for the debugging endpoint
  let ready = false;
  for (let i = 0; i < 60 && !ready; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${port}/json/version`);
      if (r.ok) ready = true;
    } catch {
      await new Promise((r) => setTimeout(r, 250));
    }
  }
  if (!ready) {
    proc.kill();
    server.close();
    console.error('chrome did not expose its debugging port');
    process.exit(1);
  }

  const failures = [];
  try {
    await cdp(port, async ({ send, on }) => {
      await send('Runtime.enable');
      await send('Log.enable');
      await send('Page.enable');
      await send('Network.enable');

      let current = '';
      on((msg) => {
        if (msg.method === 'Runtime.exceptionThrown') {
          const d = msg.params.exceptionDetails;
          failures.push(`${current} — uncaught: ${d.exception?.description ?? d.text}`);
        } else if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') {
          const text = msg.params.args.map((a) => a.description ?? a.value).join(' ');
          failures.push(`${current} — console.error: ${text}`);
        } else if (msg.method === 'Log.entryAdded' && msg.params.entry.level === 'error') {
          failures.push(`${current} — log: ${msg.params.entry.text} ${msg.params.entry.url ?? ''}`);
        } else if (msg.method === 'Network.loadingFailed') {
          failures.push(`${current} — request failed: ${msg.params.errorText}`);
        }
      });

      for (const route of ROUTES) {
        current = route;
        await send('Page.navigate', { url: base + route });
        await new Promise((r) => setTimeout(r, 1400));

        // Scroll through the page so every run="visible" mixer boots. This Chrome has no GPU,
        // so each one takes its no-WebGPU path — fallback copy, and the bench poster if it
        // has one — and any missing poster or broken fallback surfaces as an error here.
        await send('Runtime.evaluate', {
          expression: `(async () => {
            // 'instant': the site sets scroll-behavior: smooth, and a smooth scroll that is
            // still in flight when the next one starts — or when an earlier bench's fallback
            // note shifts the layout — can leave a host that never intersects.
            for (const mixer of document.querySelectorAll('mx-mixer')) {
              mixer.scrollIntoView({ block: 'center', behavior: 'instant' });
              await new Promise((r) => setTimeout(r, 250));
            }
            // Wait (bounded) until every bench has settled: running (.ready, set on mx-ready) or on
            // its fallback (.unavailable). Not "has a canvas": the host inserts its canvas before
            // awaiting the adapter, and on a slow runner that request can take seconds to fail.
            // Each round re-scrolls the first unsettled bench into view, so a layout shift can
            // delay a bench but never strand it off screen.
            const pending = () => [...document.querySelectorAll('.mx-live')].filter(
              (b) => !b.classList.contains('unavailable') && !b.classList.contains('ready'));
            for (let i = 0; i < 150; i++) {
              const left = pending();
              if (!left.length) break;
              left[0].scrollIntoView({ block: 'center', behavior: 'instant' });
              await new Promise((r) => setTimeout(r, 100));
            }
            scrollTo(0, 0);
          })()`,
          awaitPromise: true,
        });

        // Assert the page actually rendered something meaningful.
        const res = await send('Runtime.evaluate', {
          expression: `(() => {
            const main = document.querySelector('main');
            const nav = document.querySelector('.mx-topbar nav');
            const demos = document.querySelectorAll('[class*="mx-demo"], mx-demo-spine, mx-demo-wipe-dialer, mx-demo-wipe-scope, mx-demo-transition, mx-demo-matte, mx-demo-bus-board, mx-demo-trail, mx-demo-effect-numbers, mx-demo-positioner, mx-demo-audio, mx-demo-event-memory, mx-demo-special-modes, mx-demo-control-map, mx-demo-devices, mx-demo-store, mx-demo-determinism, mx-demo-primitives, mx-demo-wipe-wall');
            const benches = document.querySelectorAll('.mx-live');
            const fellBack = document.querySelectorAll('.mx-live.unavailable');
            const stuck = [...benches].filter((b) => !b.classList.contains('unavailable')).map((b) => b.id);
            let upgraded = 0;
            demos.forEach(d => { if (d.children.length > 0) upgraded++; });
            return JSON.stringify({
              title: document.title,
              mainLen: main ? main.textContent.trim().length : 0,
              hasNav: !!nav,
              demos: demos.length,
              upgraded,
              benches: benches.length,
              fellBack: fellBack.length,
              stuck,
            });
          })()`,
          returnByValue: true,
        });
        const info = JSON.parse(res.result.value);
        if (!info.hasNav) failures.push(`${route} — no navigation rendered`);
        if (info.mainLen < 400) failures.push(`${route} — main content too short (${info.mainLen} chars)`);
        // GPU-less browser: every bench must have reached its explicit fallback, none left waiting.
        if (info.benches !== info.fellBack) {
          failures.push(
            `${route} — ${info.benches - info.fellBack}/${info.benches} live benches never reached their no-WebGPU fallback (${info.stuck.join(', ')})`,
          );
        }
        if (info.demos > 0 && info.upgraded < info.demos) {
          failures.push(`${route} — ${info.demos - info.upgraded}/${info.demos} demo elements did not render`);
        }
        console.log(
          `  ${failures.length ? ' ' : '✓'} ${route.padEnd(34)} ${info.mainLen} chars, ${info.upgraded}/${info.demos} demos, ${info.fellBack}/${info.benches} benches fell back`,
        );
      }
    });
  } finally {
    proc.kill();
    server.close();
  }

  if (failures.length) {
    console.error(`\n${failures.length} problem(s):`);
    for (const f of failures) console.error('  ✗ ' + f);
    process.exit(1);
  }
  console.log('\nbrowser smoke test passed');
}

await main();
