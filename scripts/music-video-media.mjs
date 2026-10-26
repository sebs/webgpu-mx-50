// Encodes the footage and songs in video/ into the browser copies music-video.html loads
// from video/web/ — the names a music video file (docs/MUSIC-VIDEO-FORMAT.md) refers to:
//
//   <name>.mp4   from any video (.mp4 .mov .m4v .webm .mkv): 1920×1080 H.264, no audio,
//                a keyframe every 6 frames — the page retriggers clips on the beat, and a
//                seek can only land quickly near a keyframe
//   <name>.m4a   from any audio (.wav .aif .aiff .flac .mp3 .ogg .m4a .aac): AAC 192 kb/s
//
// Originals are often 4K and too heavy to decode six at once next to the renderer; Full HD
// matches the Program Out canvas. A copy newer than its original is kept (--force redoes
// everything). Needs ffmpeg on PATH.
//
// Run: npm run video:media [-- --force]

import { existsSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, extname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'video');
const OUT = join(SRC, 'web');
const VIDEO = ['.mp4', '.mov', '.m4v', '.webm', '.mkv'];
const AUDIO = ['.wav', '.aif', '.aiff', '.flac', '.mp3', '.ogg', '.m4a', '.aac'];
const force = process.argv.indexOf('--force') !== -1;

mkdirSync(OUT, { recursive: true });

function ffmpeg(args) {
  execFileSync('ffmpeg', ['-v', 'error', '-y', ...args], { stdio: 'inherit' });
}

function upToDate(source, target) {
  return !force && existsSync(target) && statSync(target).mtimeMs >= statSync(source).mtimeMs;
}

let made = 0;
let kept = 0;
for (const name of readdirSync(SRC).sort()) {
  const source = join(SRC, name);
  if (!statSync(source).isFile()) continue;
  const ext = extname(name).toLowerCase();
  const stem = basename(name, extname(name));
  if (VIDEO.indexOf(ext) !== -1) {
    const out = join(OUT, `${stem}.mp4`);
    if (upToDate(source, out)) {
      kept++;
      continue;
    }
    process.stdout.write(`clip  ${name} → web/${stem}.mp4\n`);
    ffmpeg([
      '-i', source,
      '-an',
      '-vf', 'scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080,format=yuv420p',
      '-c:v', 'libx264', '-preset', 'medium', '-crf', '22',
      '-g', '6', '-keyint_min', '6', '-sc_threshold', '0',
      '-movflags', '+faststart',
      out,
    ]);
    made++;
  } else if (AUDIO.indexOf(ext) !== -1) {
    const out = join(OUT, `${stem}.m4a`);
    if (upToDate(source, out)) {
      kept++;
      continue;
    }
    process.stdout.write(`song  ${name} → web/${stem}.m4a\n`);
    ffmpeg(['-i', source, '-vn', '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', out]);
    made++;
  }
}

process.stdout.write(`${made} encoded, ${kept} already up to date, in ${OUT}\n`);
