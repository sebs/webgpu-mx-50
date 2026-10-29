// Stills of a music video (docs/MUSIC-VIDEO-FORMAT.md) from the real renderer, without
// recording the whole song: plays the file in headless Chrome, captures the program
// picture at the requested moments, and lays them out on one labelled contact sheet.
//
//   npm run video:frames -- video/hale-rock.json                one frame per section
//   npm run video:frames -- video/hale-rock.json 16 44.5 129    these bars
//   npm run video:frames -- video/hale-rock.json --every 4      the whole cut, every 4 bars
//
// Writes video/render/frames/<file>/bar-<bar>.jpg and contact.jpg. Each frame is played
// into from two seconds before (--preroll), so trails, stills and strobes show what they
// would on air. The page comes from the site build (`npm run site:build` once); the file
// and its media are read from video/ directly, so an edited file needs no rebuild.

import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { basename, extname, join } from 'node:path';
import { ROOT, videoFile, openMusicVideo, sleep } from './music-video-browser.mjs';
import { loadMusicVideoText } from '../site/music-video/document.js';
import { barTime } from '../site/music-video/score.js';

function usage(message) {
  process.stderr.write(`${message}\nusage: npm run video:frames -- <video/name.json> [bar …] [--every <bars>] [--preroll <seconds>]\n`);
  process.exit(2);
}

function formatTime(t) {
  const tenths = Math.round(t * 10);
  const m = Math.floor(tenths / 600);
  const s = (tenths - m * 600) / 10;
  return `${m}:${s < 10 ? '0' : ''}${s.toFixed(1)}`;
}

function parseArgs(argv) {
  const opts = { file: null, bars: [], every: null, preroll: 2 };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--every' || a === '--preroll') {
      const n = Number(argv[++i]);
      if (!(n > 0) && !(a === '--preroll' && n === 0)) usage(`${a} needs a positive number`);
      if (a === '--every') opts.every = n;
      else opts.preroll = n;
    } else if (!opts.file) opts.file = a;
    else if (Number.isFinite(Number(a))) opts.bars.push(Number(a));
    else usage(`not a bar: ${a}`);
  }
  if (!opts.file) usage('which music video?');
  return opts;
}

/** The moments to capture, as { bar, t } on the song's grid. */
function moments(loaded, opts) {
  const { grid } = loaded;
  const length = loaded.score.length;
  const barOf = (t) => (t - grid.downbeat) / (240 / grid.bpm);
  let bars;
  if (opts.bars.length) bars = opts.bars;
  else if (opts.every) {
    bars = [];
    for (let b = opts.every / 2; barTime(grid, b) < length; b += opts.every) bars.push(b);
  } else {
    // Half-way through every section.
    const marks = loaded.score.markers;
    bars = marks.map((m, i) => {
      const end = i + 1 < marks.length ? marks[i + 1].at : length;
      return Math.round(barOf((Math.max(0, m.at) + end) / 2) * 4) / 4;
    });
  }
  return bars
    .map((bar) => ({ bar, t: barTime(grid, bar) }))
    .filter((m) => m.t >= 0 && m.t < length)
    .sort((a, b) => a.t - b.t);
}

function sectionAt(loaded, t) {
  let label = '';
  for (const m of loaded.score.markers) if (m.at <= t) label = m.label;
  return label;
}

function escapeHtml(s) {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
}

async function contactSheet(page, title, shots, out) {
  const cells = shots
    .map(
      (s) => `<figure><img src="data:image/jpeg;base64,${s.data}"><figcaption><b>bar ${s.bar}</b> · ${formatTime(s.t)}<br>${escapeHtml(s.section)}</figcaption></figure>`,
    )
    .join('');
  const cols = Math.min(4, shots.length);
  const width = cols * 380 + (cols - 1) * 12 + 32;
  const html = `<!doctype html><meta charset="utf-8"><style>
    body { margin: 0; padding: 16px; background: #111; color: #ddd; font: 13px/1.35 system-ui, sans-serif; width: ${width - 32}px; }
    h1 { font-size: 18px; margin: 0 0 12px; color: #fff; }
    main { display: grid; grid-template-columns: repeat(${cols}, 1fr); gap: 12px; }
    figure { margin: 0; } img { width: 100%; display: block; } b { color: #fff; }
    figcaption { padding: 4px 2px 0; }
  </style><h1>${escapeHtml(title)}</h1><main>${cells}</main>`;
  const { result } = await page.send('Page.getFrameTree');
  await page.send('Page.setDocumentContent', { frameId: result.frameTree.frame.id, html });
  await sleep(300);
  const height = await page.evaluate('Math.ceil(document.body.getBoundingClientRect().bottom)');
  const shot = await page.send('Page.captureScreenshot', {
    format: 'jpeg',
    quality: 85,
    captureBeyondViewport: true,
    clip: { x: 0, y: 0, width, height, scale: 1 },
  });
  writeFileSync(out, Buffer.from(shot.result.data, 'base64'));
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const docName = videoFile(opts.file);
  const loaded = loadMusicVideoText(readFileSync(join(ROOT, 'video', docName), 'utf8'));
  if (!loaded.score) usage(`${opts.file} does not load — run \`npm run video:check -- ${opts.file}\``);
  const wanted = moments(loaded, opts);
  if (!wanted.length) usage('no bars inside the song');

  const out = join(ROOT, 'video', 'render', 'frames', basename(docName, extname(docName)));
  mkdirSync(out, { recursive: true });
  for (const name of readdirSync(out)) if (/^(bar-.*|contact)\.jpg$/.test(name)) rmSync(join(out, name));

  const { page, title, close } = await openMusicVideo(docName, { profile: 'frames-profile' });
  try {
    await page.evaluate(`document.getElementById('play-big').click()`);
    const shots = [];
    for (const m of wanted) {
      // Play into the moment so frame-memory effects have their history.
      await page.evaluate(`(() => {
        const s = document.getElementById('scrubber');
        s.value = ${Math.max(0, m.t - opts.preroll)};
        s.dispatchEvent(new Event('input'));
        s.dispatchEvent(new Event('change'));
      })()`);
      const deadline = Date.now() + (opts.preroll + 10) * 1000;
      while ((await page.evaluate(`Number(document.getElementById('scrubber').value)`)) < m.t) {
        if (Date.now() > deadline) throw new Error(`playback did not reach bar ${m.bar}`);
        await sleep(5);
      }
      const rect = await page.evaluate(`(() => {
        const r = document.getElementById('stage').getBoundingClientRect();
        return { x: r.x, y: r.y, width: r.width, height: r.height, scale: 960 / r.width };
      })()`);
      const shot = await page.send('Page.captureScreenshot', { format: 'jpeg', quality: 85, clip: rect });
      const data = shot.result.data;
      const name = `bar-${m.bar.toFixed(2).padStart(6, '0')}.jpg`;
      writeFileSync(join(out, name), Buffer.from(data, 'base64'));
      const section = sectionAt(loaded, m.t);
      shots.push({ ...m, data, section });
      process.stdout.write(`  bar ${String(m.bar).padStart(6)}  ${formatTime(m.t).padStart(7)}  ${section}\n`);
    }
    await contactSheet(page, `${title} · ${opts.file}`, shots, join(out, 'contact.jpg'));
    process.stdout.write(`${shots.length} frames and contact.jpg in ${out}\n`);
  } finally {
    close();
  }
}

main().catch((error) => {
  process.stderr.write(`${error.message}\n`);
  process.exit(1);
});
