// Loads every built route in headless Chrome over a real HTTP server and fails on any
// console error, page error, or failed request. This is the check that catches what static
// analysis cannot: a demo that throws while rendering, a custom element that never upgrades,
// a fetch that 404s at runtime.
//
// Run: npm run site:smoke   (after site:build). Skips cleanly if no Chrome is present.

import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn, execFileSync } from 'node:child_process';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, '_site');

const ROUTES = [
  '/',
  '/machine/',
  '/machine/wipes/',
  '/machine/audio-memory-control/',
  '/architecture/',
  '/console/',
];

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.map': 'application/json',
  '.svg': 'image/svg+xml',
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
    console.log('no Chrome found — skipping browser smoke test');
    return;
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

        // Assert the page actually rendered something meaningful.
        const res = await send('Runtime.evaluate', {
          expression: `(() => {
            const main = document.querySelector('main');
            const nav = document.querySelector('.mx-topbar nav');
            const demos = document.querySelectorAll('[class*="mx-demo"], mx-demo-spine, mx-demo-wipe-dialer, mx-demo-wipe-scope, mx-demo-transition, mx-demo-matte, mx-demo-bus-board, mx-demo-trail, mx-demo-effect-numbers, mx-demo-positioner, mx-demo-audio, mx-demo-event-memory, mx-demo-special-modes, mx-demo-control-map, mx-demo-devices, mx-demo-store, mx-demo-determinism');
            let upgraded = 0;
            demos.forEach(d => { if (d.children.length > 0) upgraded++; });
            return JSON.stringify({
              title: document.title,
              mainLen: main ? main.textContent.trim().length : 0,
              hasNav: !!nav,
              demos: demos.length,
              upgraded,
            });
          })()`,
          returnByValue: true,
        });
        const info = JSON.parse(res.result.value);
        if (!info.hasNav) failures.push(`${route} — no navigation rendered`);
        if (info.mainLen < 400) failures.push(`${route} — main content too short (${info.mainLen} chars)`);
        if (info.demos > 0 && info.upgraded < info.demos) {
          failures.push(`${route} — ${info.demos - info.upgraded}/${info.demos} demo elements did not render`);
        }
        console.log(
          `  ${failures.length ? ' ' : '✓'} ${route.padEnd(34)} ${info.mainLen} chars, ${info.upgraded}/${info.demos} demos`,
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
