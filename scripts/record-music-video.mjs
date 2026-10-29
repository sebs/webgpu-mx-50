// Records a music video to a file: drives the built /music-video/ page in headless Chrome
// with ?video=<file>, presses its Record button, and lets the page's own download land in
// video/render/, named after the video's title:
//
//   video/render/<title>.raw.<mp4|webm>   what the page's MediaRecorder produced
//   video/render/<title>.mp4              re-encoded with ffmpeg (H.264/AAC, faststart,
//                                         a proper duration and seek index — browser
//                                         recordings have neither)
//
// The recording is real time (5:09) and every frame is the shipping renderer. Headless
// Chrome is never "hidden", so the render loop cannot be throttled the way a background
// tab would be. Needs a WebGPU-capable Chrome (headless with --enable-unsafe-webgpu,
// WITHOUT --disable-gpu) — a maintainer step on a machine with a GPU, not a CI one.
//
// The file must be one of the video/*.json; it and its media are served from the repo, the
// page from the site build. The browser side lives in music-video-browser.mjs.
//
// Run: npm run site:build && npm run video:record [-- video/first-cut.json]

import { mkdirSync, readdirSync, renameSync, rmSync } from 'node:fs';
import { join, extname, basename } from 'node:path';
import { execFileSync } from 'node:child_process';
import { ROOT, videoFile, openMusicVideo, sleep } from './music-video-browser.mjs';

const OUT = join(ROOT, 'video', 'render');
const INCOMING = join(OUT, '.incoming');

/** The finished download: a video file with no Chrome partial beside it. */
function finishedDownload() {
  const names = readdirSync(INCOMING);
  if (names.some((n) => n.endsWith('.crdownload'))) return null;
  return names.find((n) => /\.(mp4|webm)$/.test(n)) ?? null;
}

async function main() {
  const requested = process.argv.slice(2).filter((a) => !a.startsWith('--'))[0] ?? 'video/first-cut.json';
  const docName = videoFile(requested);

  mkdirSync(OUT, { recursive: true });
  rmSync(INCOMING, { recursive: true, force: true });
  mkdirSync(INCOMING, { recursive: true });

  const { browser, page, title, close } = await openMusicVideo(docName, { profile: 'record-profile' });
  try {
    // Downloads are a browser-level setting: let the page's own download land in OUT.
    await browser.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: INCOMING });
    process.stdout.write(`loaded "${title}" from ${requested}\n`);

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
    const stem = basename(file, ext);
    const raw = join(OUT, `${stem}.raw${ext}`);
    renameSync(join(INCOMING, file), raw);
    rmSync(INCOMING, { recursive: true, force: true });
    process.stdout.write(`recorded ${raw}\n`);

    try {
      execFileSync('ffmpeg', ['-version'], { stdio: 'ignore' });
    } catch {
      process.stdout.write('ffmpeg not found — keeping the raw recording only\n');
      return;
    }
    const mp4 = join(OUT, `${stem}.mp4`);
    execFileSync(
      'ffmpeg',
      ['-v', 'error', '-y', '-i', raw, '-c:v', 'libx264', '-preset', 'slow', '-crf', '18', '-pix_fmt', 'yuv420p',
        '-r', '60', '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', mp4],
      { stdio: 'inherit' },
    );
    process.stdout.write(`encoded  ${mp4}\n`);
  } finally {
    close();
  }
}

main().catch((error) => {
  process.stderr.write(`${error.message}\n`);
  process.exit(1);
});
