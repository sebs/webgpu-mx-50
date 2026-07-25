import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SourceBindingRegistry } from '../../src/sources/binding.js';

test('binding a source sets exactly one active binding', () => {
  const reg = new SourceBindingRegistry();
  reg.bind(1, 'camera', 'cam-1');
  const b = reg.get(1);
  assert.ok(b);
  assert.equal(b.kind, 'camera');
  assert.equal(reg.isBound(1), true);
  assert.equal(reg.isBound(2), false);
});

test('rebinding a source replaces its previous provider', () => {
  const reg = new SourceBindingRegistry();
  reg.bind(1, 'video', 'file-1');
  reg.bind(1, 'camera', 'cam-1');
  const b = reg.get(1);
  assert.ok(b);
  assert.equal(b.kind, 'camera');
  assert.equal(b.providerId, 'cam-1');
});

test('an image binding carries no audio and is a still frame', () => {
  const reg = new SourceBindingRegistry();
  reg.bind(3, 'image', 'img-1');
  const b = reg.get(3);
  assert.ok(b);
  assert.equal(b.hasAudio, false);
  assert.equal(b.still, true);
});

test('camera and video bindings carry audio', () => {
  const reg = new SourceBindingRegistry();
  reg.bind(1, 'camera', 'cam-1');
  reg.bind(2, 'video', 'file-1');
  assert.equal(reg.get(1)?.hasAudio, true);
  assert.equal(reg.get(2)?.hasAudio, true);
});

test('the same provider may back multiple sources', () => {
  const reg = new SourceBindingRegistry();
  reg.bind(2, 'camera', 'cam-1');
  reg.bind(4, 'camera', 'cam-1');
  assert.equal(reg.get(2)?.providerId, reg.get(4)?.providerId);
  assert.deepEqual(reg.availableProviders(), ['cam-1']); // distinct
});

test('a disconnected provider is marked unavailable', () => {
  const reg = new SourceBindingRegistry();
  reg.bind(1, 'camera', 'cam-1');
  reg.markUnavailable('cam-1');
  assert.equal(reg.get(1)?.available, false);
  assert.deepEqual(reg.availableProviders(), []);
});
