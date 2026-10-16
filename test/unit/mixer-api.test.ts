// Drift guards for the documented embedding surface (ADR-0017): the attribute and event
// tables the docs site renders must match what <mx-mixer> actually reads and dispatches,
// and every connected block must carry a reference entry that points at a real feature
// file. mixer.ts and blocks/index.ts extend HTMLElement, so they are read as source text
// here rather than imported.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MIXER_ATTRIBUTES, MIXER_EVENTS, MIXER_MEMBERS, MIXER_CONTEXT_MEMBERS } from '../../src/ui/mixer-api.js';
import { BLOCK_REFERENCE } from '../../src/ui/blocks/reference.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (rel: string): string => readFileSync(join(ROOT, rel), 'utf8');

function matches(source: string, re: RegExp): string[] {
  const found: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(source)) !== null) found.push(m[1]!);
  return found.filter((name, i) => found.indexOf(name) === i).sort();
}

test('MIXER_ATTRIBUTES lists exactly the attributes mx-mixer reads', () => {
  const source = read('src/ui/mixer.ts');
  const readByHost = matches(source, /(?:getAttribute\(|hasAttribute\(|dimension\(this, )'([a-z-]+)'/g);
  assert.deepEqual(MIXER_ATTRIBUTES.map((a) => a.name).sort(), readByHost);
});

test('MIXER_EVENTS lists exactly the events mx-mixer dispatches', () => {
  const source = read('src/ui/mixer.ts');
  const dispatched = matches(source, /new CustomEvent<[^>]*>\('([a-z-]+)'/g);
  assert.deepEqual(MIXER_EVENTS.map((e) => e.name).sort(), dispatched);
});

test('every documented element member exists on MxMixer', () => {
  const source = read('src/ui/mixer.ts');
  for (const member of MIXER_MEMBERS) {
    const declared = new RegExp(`^  (?:get )?${member.name}\\s*[(:]`, 'm').test(source);
    assert.ok(declared, `MxMixer has no public member "${member.name}"`);
  }
});

test('the documented context members are exactly the MixerContext interface', () => {
  const source = read('src/ui/context.ts');
  const body = /export interface MixerContext \{([\s\S]*?)\n\}/.exec(source)![1]!;
  const keys = matches(body, /^\s+(?:readonly )?([a-zA-Z]+)[(:]/gm);
  assert.deepEqual(MIXER_CONTEXT_MEMBERS.map((m) => m.name).sort(), keys);
});

test('every registered block has a reference entry, and nothing else does', () => {
  const tags = matches(read('src/ui/blocks/index.ts'), /\{ tag: '([a-z-]+)'/g);
  assert.ok(tags.length > 0);
  assert.deepEqual(Object.keys(BLOCK_REFERENCE).sort(), tags);
});

test('every block reference points at a feature file that exists', () => {
  for (const tag of Object.keys(BLOCK_REFERENCE)) {
    const ref = BLOCK_REFERENCE[tag]!;
    assert.ok(existsSync(join(ROOT, 'features', ref.feature)), `${tag}: features/${ref.feature} is missing`);
    assert.match(ref.section, /^§\d/);
  }
});
