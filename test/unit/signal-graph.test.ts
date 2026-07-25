import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createPhase0Graph, SignalGraph, STAGE_ORDER } from '../../src/core/signal-graph.js';

test('the Phase 0 graph exposes the fixed hardware stage order (ADR-0004)', () => {
  const graph = createPhase0Graph<string>();
  assert.deepEqual(graph.stageNames, [...STAGE_ORDER]);
});

test('every Phase 0 stage is a pass-through: run returns the source frame unchanged', () => {
  const graph = createPhase0Graph<string>();
  assert.equal(graph.run('SOURCE'), 'SOURCE');
});

test('stages execute strictly in order', () => {
  const trace: string[] = [];
  const stage = (name: string) => ({
    name,
    execute: (frame: string) => {
      trace.push(name);
      return frame;
    },
  });
  const graph = new SignalGraph<string>([stage('a'), stage('b'), stage('c')]);
  graph.run('x');
  assert.deepEqual(trace, ['a', 'b', 'c']);
});
