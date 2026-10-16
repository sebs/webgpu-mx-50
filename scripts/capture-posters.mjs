// Captures a still of every live bench on /machine/ from the REAL renderer, for visitors
// whose browser has no WebGPU (docs/WEBSITE.md §7.5). Each bench's Program Out canvas is
// screenshotted once it reports live, saved as site/posters/<bench-id>.jpg, and the list of
// captured ids is written to site/posters.ts — which is what the benches read, so a bench
// only ever asks for a poster that exists.
//
// Needs a WebGPU-capable Chrome (it runs headless with --enable-unsafe-webgpu and WITHOUT
// --disable-gpu). This is a maintainer step, not a CI one: CI's headless Chrome has no
// adapter. Re-run it when a look or the renderer changes, and commit the result.
//
// Run: npm run site:build && npm run site:posters

import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn, execFileSync } from 'node:child_process';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, '_site');
const POSTERS = join(ROOT, 'site', 'posters');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.jpg': 'image/jpeg' };

function findChrome() {
  const candidates = [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    process.env.CHROME_PATH,
  ].filter(Boolean);
  for (const c of candidates) if (existsSync(c)) return c;
  try {
    return execFileSync('which', ['google-chrome'], { encoding: 'utf8' }).trim() || null;
  } catch {
    return null;
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const chrome = findChrome();
  if (!chrome) throw new Error('no Chrome found (set CHROME_PATH)');
  if (!existsSync(OUT)) throw new Error('_site missing — run `npm run site:build` first');

  const server = createServer((req, res) => {
    let file = join(OUT, decodeURIComponent(new URL(req.url, 'http://x').pathname));
    if (existsSync(file) && statSync(file).isDirectory()) file = join(file, 'index.html');
    if (!existsSync(file)) {
      res.writeHead(404);
      res.end();
      return;
    }
    res.writeHead(200, { 'content-type': MIME[extname(file)] ?? 'application/octet-stream' });
    res.end(readFileSync(file));
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const port = 9700 + (process.pid % 200);
  const proc = spawn(
    chrome,
    [
      '--headless=new',
      `--remote-debugging-port=${port}`,
      '--no-first-run',
      '--enable-unsafe-webgpu',
      '--window-size=1400,1000',
      '--user-data-dir=' + join(ROOT, 'node_modules', '.cache', 'poster-profile'),
      'about:blank',
    ],
    { stdio: 'ignore' },
  );

  try {
    let ready = false;
    for (let i = 0; i < 60 && !ready; i++) {
      try {
        ready = (await fetch(`http://127.0.0.1:${port}/json/version`)).ok;
      } catch {
        await sleep(250);
      }
    }
    if (!ready) throw new Error('chrome did not expose its debugging port');
    const target = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find((t) => t.type === 'page');
    const ws = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((r, j) => {
      ws.onopen = r;
      ws.onerror = j;
    });
    let id = 0;
    const pending = new Map();
    ws.onmessage = (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id && pending.has(msg.id)) {
        pending.get(msg.id)(msg.result);
        pending.delete(msg.id);
      }
    };
    const send = (method, params = {}) =>
      new Promise((r) => {
        const myId = ++id;
        pending.set(myId, r);
        ws.send(JSON.stringify({ id: myId, method, params }));
      });
    const evaluate = async (expression) =>
      (await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })).result.value;

    await send('Page.enable');
    await send('Emulation.setDeviceMetricsOverride', { width: 1400, height: 1000, deviceScaleFactor: 1, mobile: false });
    await send('Page.navigate', { url: base + '/machine/' });
    await sleep(1500);

    const adapter = await evaluate('(async () => !!(navigator.gpu && await navigator.gpu.requestAdapter()))()');
    if (!adapter) throw new Error('this Chrome has no WebGPU adapter — posters must come from the real renderer');

    const ids = await evaluate(`[...document.querySelectorAll('.mx-live[id^="bench-"]')].map((e) => e.id)`);
    rmSync(POSTERS, { recursive: true, force: true });
    mkdirSync(POSTERS, { recursive: true });
    const captured = [];
    for (const benchId of ids) {
      await evaluate(`document.getElementById(${JSON.stringify(benchId)}).scrollIntoView({ block: 'center' })`);
      let live = false;
      for (let i = 0; i < 40 && !live; i++) {
        await sleep(150);
        live = await evaluate(`!!document.querySelector('#${benchId} mx-mixer > canvas') && /live/.test(document.querySelector('#${benchId} .mx-bench-bar .mx-chip').textContent)`);
      }
      if (!live) {
        console.log(`  ✗ ${benchId}: never went live — skipped`);
        continue;
      }
      await sleep(1400); // let the feeds and any freeze effect settle into a representative frame
      const rect = await evaluate(
        `(() => { const r = document.querySelector('#${benchId} mx-mixer > canvas').getBoundingClientRect(); return { x: r.x + scrollX, y: r.y + scrollY, width: r.width, height: r.height }; })()`, // clip is in page coordinates
      );
      const shot = await send('Page.captureScreenshot', { format: 'jpeg', quality: 82, clip: { ...rect, scale: 1 } });
      writeFileSync(join(POSTERS, `${benchId}.jpg`), Buffer.from(shot.data, 'base64'));
      captured.push(benchId);
      console.log(`  ✓ ${benchId}`);
    }
    ws.close();

    writeFileSync(
      join(ROOT, 'site', 'posters.ts'),
      `// GENERATED by scripts/capture-posters.mjs — do not edit. The live benches with a committed\n` +
        `// still in site/posters/, captured from the real renderer for browsers without WebGPU.\n\n` +
        `export const POSTERS: readonly string[] = ${JSON.stringify(captured, null, 2).replace(/"/g, "'")};\n`,
    );
    console.log(`\n${captured.length}/${ids.length} posters written to site/posters/`);
  } finally {
    proc.kill();
    server.close();
  }
}

await main();
