// Transcodes the music video's footage in video/ into the browser proxies music-video.html
// loads from video/web/:
//
//   <clip>.mp4   1920×1080 H.264, no audio, a keyframe every 6 frames — the page retriggers
//                clips on the beat, and a seek can only land quickly near a keyframe
//   song.m4a     the soundtrack as AAC (the source WAV is ~60 MB)
//
// The originals are 4K (crowd, crew) and too heavy to decode six at once next to the
// renderer; Full HD matches the Program Out canvas.
// Needs ffmpeg on PATH. Re-run when the footage in video/ changes.
//
// Run: npm run video:media

import { existsSync, mkdirSync, readdirSync } from 'node:fs';
import { join, dirname, basename, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'video');
const OUT = join(SRC, 'web');

mkdirSync(OUT, { recursive: true });

function ffmpeg(args) {
  execFileSync('ffmpeg', ['-v', 'error', '-y', ...args], { stdio: 'inherit' });
}

for (const name of readdirSync(SRC).sort()) {
  if (extname(name) !== '.mp4') continue;
  const out = join(OUT, name);
  process.stdout.write(`clip  ${name}\n`);
  ffmpeg([
    '-i', join(SRC, name),
    '-an',
    '-vf', 'scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080,format=yuv420p',
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '22',
    '-g', '6', '-keyint_min', '6', '-sc_threshold', '0',
    '-movflags', '+faststart',
    out,
  ]);
}

const song = join(SRC, 'song.wav');
if (existsSync(song)) {
  process.stdout.write(`song  ${basename(song)}\n`);
  ffmpeg(['-i', song, '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', join(OUT, 'song.m4a')]);
}

process.stdout.write(`proxies written to ${OUT}\n`);
