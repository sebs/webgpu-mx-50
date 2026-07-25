import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createPerBusGraph,
  createDownstreamGraph,
  SignalGraph,
  STAGE_ORDER,
  PER_BUS_STAGES,
  DOWNSTREAM_STAGES,
} from '../../src/core/signal-graph.js';

test('the full stage order is the fixed hardware flow (ADR-0004)', () => {
  assert.deepEqual(
    [...STAGE_ORDER],
    ['colour-correction', 'digital-effect', 'mix-wipe', 'downstream-key', 'fade'],
  );
});

test('the per-bus and downstream branches expose their stages, all pass-through', () => {
  const perBus = createPerBusGraph<string>();
  const downstream = createDownstreamGraph<string>();
  assert.deepEqual(perBus.stageNames, [...PER_BUS_STAGES]);
  assert.deepEqual(downstream.stageNames, [...DOWNSTREAM_STAGES]);
  assert.equal(perBus.run('A'), 'A'); // pass-through
  assert.equal(downstream.run('composite'), 'composite');
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
