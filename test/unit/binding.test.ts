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

// --- activeProvider + the External Camera In (browser-I/O sweep) ------------

test('activeProvider reflects availability: unbound → null, bound → id, lost → null', () => {
  const reg = new SourceBindingRegistry();
  assert.equal(reg.activeProvider(1), null);
  reg.bind(1, 'camera', 'camera:cam-1');
  assert.equal(reg.activeProvider(1), 'camera:cam-1');
  reg.markUnavailable('camera:cam-1');
  assert.equal(reg.activeProvider(1), null);
  assert.equal(reg.get(1)!.available, false); // the binding object survives, unavailable
  reg.bind(1, 'camera', 'camera:cam-2');
  assert.equal(reg.activeProvider(1), 'camera:cam-2');
});

test('bindExtCamera holds one replaceable binding, camera or video kind', () => {
  const reg = new SourceBindingRegistry();
  assert.equal(reg.getExtCamera(), null);
  reg.bindExtCamera('camera', 'cam-1');
  assert.equal(reg.getExtCamera()!.kind, 'camera');
  reg.bindExtCamera('video', 'file:title.mp4');
  assert.equal(reg.getExtCamera()!.kind, 'video');
  assert.equal(reg.extCameraAvailable(), true);
});

test('the External Camera binding is never offered as a bus source', () => {
  const reg = new SourceBindingRegistry();
  reg.bind(2, 'camera', 'camera:bus-cam');
  reg.bindExtCamera('camera', 'camera:ext-cam');
  assert.equal(reg.availableProviders().indexOf('camera:ext-cam'), -1);
  assert.notEqual(reg.availableProviders().indexOf('camera:bus-cam'), -1);
});

test('markUnavailable reaches the External Camera; clearExtCamera removes it', () => {
  const reg = new SourceBindingRegistry();
  reg.bindExtCamera('camera', 'cam-1');
  reg.markUnavailable('cam-1');
  assert.equal(reg.extCameraAvailable(), false);
  assert.equal(reg.getExtCamera()!.available, false);
  reg.clearExtCamera();
  assert.equal(reg.getExtCamera(), null);
  assert.equal(reg.extCameraAvailable(), false);
});
