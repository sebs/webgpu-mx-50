// Records the music video to a file: drives the built /music-video/ page in headless Chrome,
// presses its Record button, and lets the page's own download land in video/render/.
//
//   video/render/music-video.raw.<mp4|webm>   what the page's MediaRecorder produced
//   video/render/music-video.mp4              re-encoded with ffmpeg (H.264/AAC, faststart,
//                                             a proper duration and seek index — browser
//                                             recordings have neither)
//
// The recording is real time (5:09) and every frame is the shipping renderer. Headless
// Chrome is never "hidden", so the render loop cannot be throttled the way a background
// tab would be. Needs a WebGPU-capable Chrome (headless with --enable-unsafe-webgpu,
// WITHOUT --disable-gpu) — a maintainer step on a machine with a GPU, not a CI one.
//
// Run: npm run site:build && npm run video:record

import { createServer } from 'node:http';
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync } from 'node:fs';
import { join, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn, execFileSync } from 'node:child_process';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SITE = join(ROOT, '_site');
const OUT = join(ROOT, 'video', 'render');
const MIME = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.json': 'application/json',
  '.mp4': 'video/mp4',
  '.m4a': 'audio/mp4',
};

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

async function connect(wsUrl) {
  const ws = new WebSocket(wsUrl);
  await new Promise((r, j) => {
    ws.onopen = r;
    ws.onerror = j;
  });
  let id = 0;
  const pending = new Map();
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      pending.get(msg.id)(msg);
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
    const { result } = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text);
    return result.result.value;
  };
  return { ws, send, evaluate };
}

/** The finished download: a music-video.* file with no Chrome partial beside it. */
function finishedDownload() {
  const names = readdirSync(OUT);
  if (names.some((n) => n.endsWith('.crdownload'))) return null;
  return names.find((n) => /^music-video\.(mp4|webm)$/.test(n)) ?? null;
}

async function main() {
  if (!existsSync(join(SITE, 'music-video', 'index.html'))) {
    throw new Error('_site/music-video is missing — run `npm run site:build` first');
  }
  const chrome = findChrome();
  if (!chrome) throw new Error('no Chrome found (set CHROME_PATH)');

  mkdirSync(OUT, { recursive: true });
  for (const n of readdirSync(OUT)) if (n.startsWith('music-video.')) rmSync(join(OUT, n));

  const server = createServer((req, res) => {
    let file = join(SITE, decodeURIComponent(req.url.split('?')[0]));
    if (existsSync(file) && statSync(file).isDirectory()) file = join(file, 'index.html');
    if (!file.startsWith(SITE) || !existsSync(file)) {
      res.writeHead(404).end();
      return;
    }
    res.writeHead(200, { 'content-type': MIME[extname(file)] ?? 'application/octet-stream' });
    res.end(readFileSync(file));
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;

  const port = 9500 + (process.pid % 200);
  const proc = spawn(
    chrome,
    [
      '--headless=new',
      `--remote-debugging-port=${port}`,
      '--no-first-run',
      '--enable-unsafe-webgpu',
      '--autoplay-policy=no-user-gesture-required',
      '--disable-background-timer-throttling',
      '--disable-renderer-backgrounding',
      '--disable-backgrounding-occluded-windows',
      '--window-size=1400,1000',
      '--user-data-dir=' + join(ROOT, 'node_modules', '.cache', 'record-profile'),
      'about:blank',
    ],
    { stdio: 'ignore' },
  );

  try {
    let version = null;
    for (let i = 0; i < 60 && !version; i++) {
      try {
        version = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json();
      } catch {
        await sleep(250);
      }
    }
    if (!version) throw new Error('chrome did not expose its debugging port');

    // Downloads are a browser-level setting: let the page's own download land in OUT.
    const browser = await connect(version.webSocketDebuggerUrl);
    await browser.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: OUT });

    const target = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find((t) => t.type === 'page');
    const page = await connect(target.webSocketDebuggerUrl);
    await page.send('Runtime.enable');
    await page.send('Page.enable');

    // navigator.gpu exists only in a secure context, so ask from the page, not about:blank.
    await page.send('Page.navigate', { url: `${base}/music-video/` });
    await sleep(500);
    const adapter = await page.evaluate('navigator.gpu ? navigator.gpu.requestAdapter().then((a) => !!a) : false');
    if (!adapter) throw new Error('this Chrome has no WebGPU adapter — the recording must come from the real renderer');

    let state = '';
    for (let i = 0; i < 240 && !/ready|failed/.test(state); i++) {
      await sleep(500);
      state = (await page.evaluate(`document.getElementById('overlay')?.className ?? ''`)) ?? '';
    }
    if (!/ready/.test(state)) {
      throw new Error(`the page never became ready: ${await page.evaluate(`document.getElementById('status')?.textContent`)}`);
    }

    process.stdout.write('recording in real time (about 5 minutes)…\n');
    await page.evaluate(`document.getElementById('record').click()`);

    let file = null;
    let lastLog = 0;
    const deadline = Date.now() + 8 * 60 * 1000;
    while (!(file = finishedDownload())) {
      if (Date.now() > deadline) throw new Error('no recording arrived within 8 minutes');
      await sleep(1000);
      if (Date.now() - lastLog > 30000) {
        lastLog = Date.now();
        const where = await page.evaluate(`document.getElementById('time').textContent + '  ' + document.getElementById('section').textContent`);
        process.stdout.write(`  ${where}\n`);
      }
    }

    const ext = extname(file);
    const raw = join(OUT, `music-video.raw${ext}`);
    renameSync(join(OUT, file), raw);
    process.stdout.write(`recorded ${raw}\n`);

    try {
      execFileSync('ffmpeg', ['-version'], { stdio: 'ignore' });
    } catch {
      process.stdout.write('ffmpeg not found — keeping the raw recording only\n');
      return;
    }
    const mp4 = join(OUT, 'music-video.mp4');
    execFileSync(
      'ffmpeg',
      ['-v', 'error', '-y', '-i', raw, '-c:v', 'libx264', '-preset', 'slow', '-crf', '18', '-pix_fmt', 'yuv420p',
        '-r', '60', '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', mp4],
      { stdio: 'inherit' },
    );
    process.stdout.write(`encoded  ${mp4}\n`);
  } finally {
    proc.kill();
    server.close();
  }
}

main().catch((error) => {
  process.stderr.write(`${error.message}\n`);
  process.exit(1);
});
