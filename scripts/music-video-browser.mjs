// Headless Chrome around the built /music-video/ page, shared by the scripts that drive it
// (record-music-video.mjs, music-video-frames.mjs): serve _site/, launch Chrome with
// WebGPU, talk to it over the DevTools protocol, and open a music video file until the
// page says it is ready. The page and its code come from the site build; video/ (the music
// video files and their encoded media) is served straight from the repo, so an edited
// file needs no rebuild.

import { createServer } from 'node:http';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join, extname, dirname, basename, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn, execFileSync } from 'node:child_process';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
export const SITE = join(ROOT, '_site');
const MIME = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.json': 'application/json',
  '.mp4': 'video/mp4',
  '.m4a': 'audio/mp4',
};

export function findChrome() {
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

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function connect(wsUrl) {
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

/** The file name of a music video in video/, or an error. */
export function videoFile(requested) {
  if (!existsSync(join(SITE, 'music-video', 'index.html'))) {
    throw new Error('_site/music-video is missing — run `npm run site:build` first');
  }
  const docName = basename(requested);
  if (resolve(requested) !== join(ROOT, 'video', docName) || !existsSync(join(ROOT, 'video', docName))) {
    throw new Error(`${requested}: use a music video file in video/`);
  }
  return docName;
}

/** Where a request path lives on disk: video/ from the repo, everything else from _site/. */
function fileFor(urlPath) {
  const path = decodeURIComponent(urlPath.split('?')[0]);
  const live = '/music-video/video/';
  const file = path.startsWith(live) ? join(ROOT, 'video', path.slice(live.length)) : join(SITE, path);
  if (!file.startsWith(SITE + sep) && !file.startsWith(join(ROOT, 'video') + sep)) return null;
  if (existsSync(file) && statSync(file).isDirectory()) return join(file, 'index.html');
  return existsSync(file) ? file : null;
}

/**
 * Serve _site/, start headless Chrome with WebGPU, and open the music video page on
 * `docName`. Resolves once the page reports it ready; `close()` stops both.
 */
export async function openMusicVideo(docName, { profile, windowSize = '1400,1000' }) {
  const chrome = findChrome();
  if (!chrome) throw new Error('no Chrome found (set CHROME_PATH)');

  const server = createServer((req, res) => {
    const file = fileFor(req.url);
    if (!file || !existsSync(file)) {
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
      `--window-size=${windowSize}`,
      '--user-data-dir=' + join(ROOT, 'node_modules', '.cache', profile),
      'about:blank',
    ],
    { stdio: 'ignore' },
  );
  const close = () => {
    proc.kill();
    server.close();
  };

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

    const browser = await connect(version.webSocketDebuggerUrl);
    const target = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find((t) => t.type === 'page');
    const page = await connect(target.webSocketDebuggerUrl);
    await page.send('Runtime.enable');
    await page.send('Page.enable');

    // navigator.gpu exists only in a secure context, so ask from the page, not about:blank.
    await page.send('Page.navigate', { url: `${base}/music-video/?video=video/${encodeURIComponent(docName)}` });
    await sleep(500);
    const adapter = await page.evaluate('navigator.gpu ? navigator.gpu.requestAdapter().then((a) => !!a) : false');
    if (!adapter) throw new Error('this Chrome has no WebGPU adapter — the pictures must come from the real renderer');

    let state = '';
    for (let i = 0; i < 240 && !/ready|failed/.test(state); i++) {
      await sleep(500);
      state = (await page.evaluate(`document.getElementById('overlay')?.className ?? ''`)) ?? '';
    }
    if (!/ready/.test(state)) {
      const why = await page.evaluate(
        `document.getElementById('status')?.textContent + '\\n' + [...document.querySelectorAll('#problems li')].map((li) => '  ' + li.textContent).join('\\n')`,
      );
      throw new Error(`the page could not load ${docName}: ${why}`);
    }
    const title = await page.evaluate(`document.getElementById('title').textContent`);
    return { browser, page, title, close };
  } catch (error) {
    close();
    throw error;
  }
}
