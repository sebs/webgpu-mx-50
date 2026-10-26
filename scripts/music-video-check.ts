// Checks a music video file (docs/MUSIC-VIDEO-FORMAT.md) the way the page loads it: the
// same validator, the same compile through the real reducer, the same intent checks — and
// that every clip and the song can be found. Prints the problems with their JSON paths
// and a short summary of the cut, so a human or an LLM can iterate on the file until it
// reports nothing.
//
// Media is looked up as the page will find it: an encoded copy in video/web/ (what the
// page fetches; `npm run video:media` makes them), else an original beside the file.
//
// Run: npm run video:check -- video/first-cut.json [more.json …]
// Exit code 1 when any file has errors (warnings alone pass).

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { basename, dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { errorsOf, formatProblem, loadMusicVideoText } from '../site/music-video/document.js';
import { INPUTS } from '../site/music-video/score.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const WEB = join(ROOT, 'video', 'web');

function stem(name: string): string {
  return basename(name, extname(name));
}

/** Where the page (or a Load from disk) would find a media file, or null. */
function findMedia(file: string, docDir: string): string | null {
  if (existsSync(join(WEB, file))) return join(WEB, file);
  if (existsSync(join(docDir, file))) return join(docDir, file);
  // A Load from disk matches by stem too (track.wav stands in for track.m4a).
  for (const dir of [docDir, WEB]) {
    if (!existsSync(dir)) continue;
    const hit = readdirSync(dir).filter((n) => stem(n) === stem(file))[0];
    if (hit) return join(dir, hit);
  }
  return null;
}

function formatTime(t: number): string {
  const m = Math.floor(t / 60);
  const s = t - m * 60;
  return `${m}:${s < 10 ? '0' : ''}${s.toFixed(1)}`;
}

function check(path: string): boolean {
  const file = resolve(path);
  process.stdout.write(`\n${path}\n`);
  if (!existsSync(file)) {
    process.stdout.write('  error   file not found\n');
    return false;
  }
  const loaded = loadMusicVideoText(readFileSync(file, 'utf8'));
  const problems = loaded.problems.slice();

  const docDir = dirname(file);
  const media = loaded.clips.map((c) => ({ path: `clip "${c.id}"`, file: c.file }));
  if (loaded.doc.song && loaded.doc.song.file) media.push({ path: '$.song.file', file: loaded.doc.song.file });
  const missing = media.filter((m) => !findMedia(m.file, docDir));
  for (const m of missing) {
    problems.push({ severity: 'warning', path: m.path, message: `${m.file} is neither in video/web/ nor beside the file — run \`npm run video:media\`, or pick it with Load` });
  }

  for (const p of problems) process.stdout.write(`  ${formatProblem(p)}\n`);
  const score = loaded.score;
  if (score) {
    const doc = loaded.doc;
    const used = new Set<string>();
    for (const cue of score.cues) for (const input of INPUTS) used.add(cue.patch[input]);
    const unused = loaded.clips.filter((c) => !used.has(c.id)).map((c) => c.id);
    process.stdout.write(
      `  "${doc.title}" · ${doc.song.bpm} bpm · ${formatTime(score.length)} · ${score.markers.length} sections · ${score.cues.length} cues · ` +
        `${loaded.clips.length} clips${unused.length ? ` (never patched in: ${unused.join(', ')})` : ''}\n`,
    );
    for (const m of score.markers) {
      const bar = (m.at - loaded.grid.downbeat) / ((240 / loaded.grid.bpm));
      process.stdout.write(`    ${formatTime(m.at).padStart(7)}  bar ${bar.toFixed(2).padStart(7)}  ${m.label}\n`);
    }
  }
  const ok = errorsOf(problems).length === 0;
  process.stdout.write(ok ? (problems.length ? '  ok, with warnings\n' : '  ok\n') : '  FAILED\n');
  return ok;
}

const files = process.argv.slice(2);
if (!files.length) {
  process.stderr.write('usage: npm run video:check -- <music-video.json> [more.json …]\n');
  process.exit(2);
}
let failed = 0;
for (const f of files) if (!check(f)) failed++;
process.exit(failed ? 1 : 0);
