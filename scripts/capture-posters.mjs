// Captures the site's fallback media from the REAL renderer, for visitors whose browser has
// no WebGPU (docs/WEBSITE.md §7.5):
//
//   site/posters/<id>.jpg    a still of each live bench and of the wipe wall
//   site/posters/<id>.webm   a short recorded loop of each Machine bench and the Overview hero
//   site/assets/social-card.jpg   the 1200×630 og:image, a real frame with the title over it
//   site/posters.ts          the ids captured, which is what the pages read — so a page only
//                            ever asks for media that exists
//
// Loops are recorded in the page itself: MediaRecorder over the Program Out canvas's
// captureStream, handed back to Node as a data URL. Nothing is synthesised; every frame is
// the shipping WGSL.
//
// Needs a WebGPU-capable Chrome (headless with --enable-unsafe-webgpu, WITHOUT
// --disable-gpu). A maintainer step, not a CI one: CI's headless Chrome has no adapter.
// Re-run it when a look or the renderer changes, and commit the result.
//
// Run: npm run site:build && npm run site:posters

import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync, writeFileSync, mkdirSync, rmSync, renameSync, copyFileSync } from 'node:fs';
import { join, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn, execFileSync } from 'node:child_process';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, '_site');
const POSTERS = join(ROOT, 'site', 'posters');
const ASSETS = join(ROOT, 'site', 'assets');
// Everything is captured here first and swapped into site/ only once the whole run has
// succeeded, so a run that fails part-way leaves the committed set — files AND the
// site/posters.ts id list — exactly as it was.
const STAGING = join(ROOT, 'node_modules', '.cache', 'capture-staging');
const STAGED_POSTERS = join(STAGING, 'posters');
const MIME = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.json': 'application/json',
  '.jpg': 'image/jpeg',
  '.webm': 'video/webm',
};

/** What to capture, page by page. `selector` picks the roots; each must reach `.ready`. */
const TARGETS = [
  { page: '/machine/', selector: '.mx-live[id^="bench-"]', still: true, loop: 4000 },
  { page: '/machine/wipes/', selector: '#bench-wipe-wall', still: true, loop: 0 },
  { page: '/', selector: '#hero-monitor', still: false, loop: 8000 },
];

const LOOP_BITS = { 4000: 450_000, 8000: 900_000 };
/** A loop smaller than this recorded (next to) nothing; real 4 s loops are over 100 KB. */
const MIN_LOOP_BYTES = 20_000;

const SOCIAL_HTML = `<!doctype html><html><head><meta charset="utf-8"><style>
  html, body { margin: 0; width: 1200px; height: 630px; overflow: hidden; background: #0b0c14; }
  mx-mixer { position: absolute; inset: 0; display: block; }
  mx-mixer > canvas { width: 1200px; height: 630px; display: block; }
  .veil { position: absolute; inset: 0; background: linear-gradient(90deg, rgba(11,12,20,0.94) 0%, rgba(11,12,20,0.78) 46%, rgba(11,12,20,0.05) 78%); }
  .text { position: absolute; left: 72px; top: 0; bottom: 0; width: 620px; display: flex; flex-direction: column; justify-content: center;
    font-family: system-ui, -apple-system, "Segoe UI", sans-serif; color: #e9e9ed; }
  .mark { display: flex; align-items: center; gap: 14px; font-size: 30px; font-weight: 650; letter-spacing: -0.01em; }
  .dot { width: 16px; height: 16px; border-radius: 50%; background: #e2564d; box-shadow: 0 0 18px rgba(226,86,77,0.8); }
  h1 { margin: 26px 0 22px; font-size: 56px; line-height: 1.08; font-weight: 700; letter-spacing: -0.02em; }
  p { margin: 0; font-size: 22px; line-height: 1.45; color: #a6aabb; }
  .label { margin-top: 34px; font-size: 14px; letter-spacing: 0.18em; text-transform: uppercase; color: #f2a23c; }
</style></head><body>
  <mx-mixer feeds="pattern" width="1200" height="630" preset="/site/generated/presets/wipe-border.json"></mx-mixer>
  <div class="veil"></div>
  <div class="text">
    <div class="mark"><span class="dot"></span>web-mx-50</div>
    <h1>A 1990s broadcast mixer, rebuilt in the browser.</h1>
    <p>The Panasonic WJ-MX50, block for block, on WebGPU — vanilla TypeScript, no framework, no bundler, pinned by specs written from the manual.</p>
    <div class="label">Live · open source · AGPL-3.0</div>
  </div>
  <script type="module">
    import { defineMixer } from '/src/ui/mixer.js';
    defineMixer();
    document.querySelector('mx-mixer').addEventListener('mx-ready', () => document.body.classList.add('ready'));
  </script>
</body></html>`;

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

async function connect(port) {
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
  const evaluate = async (expression) => {
    const res = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (res.exceptionDetails) throw new Error(res.exceptionDetails.exception?.description ?? res.exceptionDetails.text);
    return res.result.value;
  };
  return { ws, send, evaluate };
}

/** Clip rect of `selector` in page coordinates (what Page.captureScreenshot's clip expects). */
const rectOf = (selector) =>
  `(() => { const r = document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();
     return { x: r.x + scrollX, y: r.y + scrollY, width: r.width, height: r.height, scale: 1 }; })()`;

/** Record `ms` of a canvas in the page: { type, chunks, bytes, data } with data as a data URL. */
const recordLoop = (selector, ms, bits) => `(async () => {
  const canvas = document.querySelector(${JSON.stringify(selector)});
  const type = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'].find((t) => MediaRecorder.isTypeSupported(t));
  if (!type) return { type: null, chunks: 0, bytes: 0, data: '' };
  const rec = new MediaRecorder(canvas.captureStream(30), { mimeType: type, videoBitsPerSecond: ${bits} });
  const chunks = [];
  rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
  const done = new Promise((r) => (rec.onstop = r));
  rec.start();
  await new Promise((r) => setTimeout(r, ${ms}));
  rec.stop();
  await done;
  const blob = new Blob(chunks, { type: 'video/webm' });
  const data = await new Promise((r) => { const f = new FileReader(); f.onload = () => r(f.result); f.readAsDataURL(blob); });
  return { type, chunks: chunks.length, bytes: blob.size, data };
})()`;

async function main() {
  const chrome = findChrome();
  if (!chrome) throw new Error('no Chrome found (set CHROME_PATH)');
  if (!existsSync(OUT)) throw new Error('_site missing — run `npm run site:build` first');

  const server = createServer((req, res) => {
    const path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (path === '/__social.html') {
      res.writeHead(200, { 'content-type': 'text/html' });
      res.end(SOCIAL_HTML);
      return;
    }
    let file = join(OUT, path);
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
      '--autoplay-policy=no-user-gesture-required',
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
    const { ws, send, evaluate } = await connect(port);
    await send('Page.enable');
    await send('Emulation.setDeviceMetricsOverride', { width: 1400, height: 1000, deviceScaleFactor: 1, mobile: false });

    // Prove there is a real adapter BEFORE touching anything committed: a run on a Chrome
    // without WebGPU must fail with the old captures intact, not after deleting them.
    await send('Page.navigate', { url: base + '/' });
    await sleep(800);
    const adapter = await evaluate('(async () => !!(navigator.gpu && await navigator.gpu.requestAdapter()))()');
    if (!adapter) throw new Error('this Chrome has no WebGPU adapter — captures must come from the real renderer; nothing was changed');

    rmSync(STAGING, { recursive: true, force: true });
    mkdirSync(STAGED_POSTERS, { recursive: true });
    const stills = [];
    const loops = [];

    for (const target of TARGETS) {
      await send('Page.navigate', { url: base + target.page });
      await sleep(1500);
      const ids = await evaluate(`[...document.querySelectorAll(${JSON.stringify(target.selector)})].map((e) => e.id)`);
      for (const id of ids) {
        const sel = `#${id}`;
        let live = false;
        for (let i = 0; i < 60 && !live; i++) {
          await evaluate(`document.querySelector('${sel}').scrollIntoView({ block: 'center', behavior: 'instant' })`);
          await sleep(150);
          live = await evaluate(`document.querySelector('${sel}').classList.contains('ready')`);
        }
        if (!live) {
          console.log(`  ✗ ${id}: never went live — skipped`);
          continue;
        }
        await sleep(1400); // let the feeds and any freeze effect settle into a representative frame

        if (target.loop) {
          const rec = await evaluate(recordLoop(`${sel} canvas[data-loop]`, target.loop, LOOP_BITS[target.loop]));
          // An empty or near-empty recording (no WebM support, or a canvas that stopped
          // producing frames) must not be committed as a loop that never plays. Fail the run;
          // the staged swap means nothing committed changes.
          if (!rec.type) throw new Error(`${id}: this Chrome's MediaRecorder supports no WebM type`);
          if (rec.chunks === 0 || rec.bytes < MIN_LOOP_BYTES) {
            throw new Error(`${id}: the loop recorded ${rec.bytes} bytes in ${rec.chunks} chunks — the canvas produced (almost) no frames`);
          }
          writeFileSync(join(STAGED_POSTERS, `${id}.webm`), Buffer.from(rec.data.slice(rec.data.indexOf(',') + 1), 'base64'));
          loops.push(id);
        }
        if (target.still) {
          await evaluate(`document.querySelector('${sel}').dispatchEvent(new CustomEvent('mx-poster-prepare'))`);
          await sleep(500);
          await evaluate(`document.querySelector('${sel}').scrollIntoView({ block: 'center', behavior: 'instant' })`);
          await sleep(300);
          let clip = await evaluate(rectOf(`${sel} [data-poster]`));
          // Taller than the viewport (the wipe wall): grow the viewport so the whole target is on
          // screen — and therefore rendering, since off-screen cells deliberately skip frames.
          const tall = clip.height > 900;
          if (tall) {
            await send('Emulation.setDeviceMetricsOverride', { width: 1400, height: Math.ceil(clip.height) + 160, deviceScaleFactor: 1, mobile: false });
            await evaluate(`document.querySelector('${sel} [data-poster]').scrollIntoView({ block: 'center', behavior: 'instant' })`);
            await sleep(900);
            clip = await evaluate(rectOf(`${sel} [data-poster]`));
          }
          const shot = await send('Page.captureScreenshot', { format: 'jpeg', quality: 82, clip });
          if (tall) await send('Emulation.setDeviceMetricsOverride', { width: 1400, height: 1000, deviceScaleFactor: 1, mobile: false });
          writeFileSync(join(STAGED_POSTERS, `${id}.jpg`), Buffer.from(shot.data, 'base64'));
          stills.push(id);
        } else if (target.loop) {
          // A loop's <video> needs a poster frame too: the still of the same canvas.
          const clip = await evaluate(rectOf(`${sel} canvas[data-loop]`));
          const shot = await send('Page.captureScreenshot', { format: 'jpeg', quality: 82, clip });
          writeFileSync(join(STAGED_POSTERS, `${id}.jpg`), Buffer.from(shot.data, 'base64'));
        }
        console.log(`  ✓ ${id}${target.still ? ' still' : ''}${target.loop ? ' + loop' : ''}`);
      }
    }

    // The social card: a real frame at 1200×630 with the title over it.
    await send('Emulation.setDeviceMetricsOverride', { width: 1200, height: 630, deviceScaleFactor: 1, mobile: false });
    await send('Page.navigate', { url: base + '/__social.html' });
    let socialReady = false;
    for (let i = 0; i < 60 && !socialReady; i++) {
      await sleep(150);
      socialReady = await evaluate(`document.body.classList.contains('ready')`);
    }
    if (!socialReady) throw new Error('the social-card mixer never went live');
    await sleep(1500);
    const card = await send('Page.captureScreenshot', { format: 'jpeg', quality: 86, clip: { x: 0, y: 0, width: 1200, height: 630, scale: 1 } });
    writeFileSync(join(STAGING, 'social-card.jpg'), Buffer.from(card.data, 'base64'));
    console.log('  ✓ social card');
    ws.close();

    // The whole run succeeded: swap the staged captures in, then the id list that names them.
    rmSync(POSTERS, { recursive: true, force: true });
    renameSync(STAGED_POSTERS, POSTERS);
    mkdirSync(ASSETS, { recursive: true });
    copyFileSync(join(STAGING, 'social-card.jpg'), join(ASSETS, 'social-card.jpg'));
    rmSync(STAGING, { recursive: true, force: true });
    const list = (ids) => JSON.stringify(ids, null, 2).replace(/"/g, "'");
    writeFileSync(
      join(ROOT, 'site', 'posters.ts'),
      `// GENERATED by scripts/capture-posters.mjs — do not edit. Ids with committed captures from the\n` +
        `// real renderer, for browsers without WebGPU: POSTERS have site/posters/<id>.jpg, LOOPS also\n` +
        `// have site/posters/<id>.webm.\n\n` +
        `export const POSTERS: readonly string[] = ${list(stills)};\n\n` +
        `export const LOOPS: readonly string[] = ${list(loops)};\n`,
    );
    console.log(`\n${stills.length} stills, ${loops.length} loops and the social card written`);
  } finally {
    proc.kill();
    server.close();
  }
}

await main();
