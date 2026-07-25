import { test } from 'node:test';
import assert from 'node:assert/strict';
import { programVideo, programAudio, directOutSource } from '../../src/core/program.js';
import { FACTORY_PRESET } from '../../src/state/state.js';

function withProgram(mode: 'A' | 'B' | 'effect') {
  const s = structuredClone(FACTORY_PRESET);
  s.programOut = mode;
  return s;
}

test('EFFECT applies every stage; A/B bypass them', () => {
  assert.equal(programVideo(withProgram('effect')).effectApplied, true);
  assert.equal(programVideo(withProgram('A')).effectApplied, false);
  assert.equal(programVideo(withProgram('A')).bus, 'A');
  assert.equal(programVideo(withProgram('B')).bus, 'B');
});

test('direct-out audio carries only its bus + aux; EFFECT carries both buses + Master', () => {
  const a = programAudio(withProgram('A'));
  assert.deepEqual(a.contributors, ['busA', 'aux1', 'aux2mic']);
  assert.equal(a.masterGoverns, false);
  assert.ok(!a.contributors.includes('busB'));

  const eff = programAudio(withProgram('effect'));
  assert.deepEqual(eff.contributors, ['busA', 'busB', 'aux1', 'aux2mic']);
  assert.equal(eff.masterGoverns, true);
});

test('direct-out of a Matte-holding bus yields the blinking substitute, not Matte', () => {
  const s = withProgram('A');
  s.busA = { source: 'matte', substituteSource: 3 };
  assert.equal(directOutSource(s, 'A'), 3);
});

test('direct-out of a plain bus yields that source', () => {
  const s = withProgram('B');
  s.busB = { source: 4, substituteSource: 4 };
  assert.equal(directOutSource(s, 'B'), 4);
});
