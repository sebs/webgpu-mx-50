import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AudioInputBindingRegistry } from '../../src/sources/audio-binding.js';
import { MediaDeviceCatalog } from '../../src/sources/device-catalog.js';
import { CAMERA_UNBOUND, cameraFeedsKey, stepCamera } from '../../src/sources/camera-lifecycle.js';
import type { CameraLifecycle } from '../../src/sources/camera-lifecycle.js';
import type { CatalogDevice } from '../../src/sources/device-catalog.js';

const cam = (id: string): CatalogDevice => ({ deviceId: id, label: id.toUpperCase(), kind: 'videoinput' });
const mic = (id: string): CatalogDevice => ({ deviceId: id, label: id.toUpperCase(), kind: 'audioinput' });

// --- AudioInputBindingRegistry ----------------------------------------------

test('audio bindings store kind+provider per channel; rebinding replaces', () => {
  const reg = new AudioInputBindingRegistry();
  reg.bind('aux1', 'mic-device', 'mic-1');
  assert.equal(reg.get('aux1')!.kind, 'mic-device');
  reg.bind('aux1', 'audio-file', 'file:track.mp3');
  assert.equal(reg.get('aux1')!.kind, 'audio-file');
  assert.equal(reg.get('aux1')!.providerId, 'file:track.mp3');
  assert.equal(reg.isBound('aux2'), false);
  reg.clear('aux1');
  assert.equal(reg.isBound('aux1'), false);
});

test('audio channels are independent; markUnavailable fans out by provider', () => {
  const reg = new AudioInputBindingRegistry();
  reg.bind('mic', 'mic-device', 'shared-dev');
  reg.bind('aux2', 'line-device', 'shared-dev');
  reg.bind('aux1', 'audio-file', 'file:a.mp3');
  reg.markUnavailable('shared-dev');
  assert.equal(reg.get('mic')!.available, false);
  assert.equal(reg.get('aux2')!.available, false);
  assert.equal(reg.get('aux1')!.available, true);
});

// --- MediaDeviceCatalog ------------------------------------------------------

test('permission starts at prompt with an empty, invisible device list', () => {
  const cat = new MediaDeviceCatalog();
  assert.equal(cat.permission('videoinput'), 'prompt');
  assert.equal(cat.requiresPrompt('videoinput'), true);
  assert.deepEqual(cat.devices('videoinput'), []);
});

test('grant populates the labeled device list; deny leaves it empty', () => {
  const cat = new MediaDeviceCatalog();
  cat.grant('videoinput', [cam('cam-1')]);
  assert.equal(cat.permission('videoinput'), 'granted');
  assert.equal(cat.requiresPrompt('videoinput'), false);
  assert.equal(cat.devices('videoinput').length, 1);
  assert.equal(cat.devices('videoinput')[0]!.label, 'CAM-1');
  const denied = new MediaDeviceCatalog();
  denied.deny('audioinput');
  assert.equal(denied.permission('audioinput'), 'denied');
  assert.deepEqual(denied.devices('audioinput'), []);
  assert.equal(denied.requiresPrompt('audioinput'), false);
});

test('refresh replaces the enumerated set without touching permission', () => {
  const cat = new MediaDeviceCatalog();
  cat.grant('videoinput', [cam('cam-1')]);
  cat.refresh([cam('cam-1'), cam('cam-new')]);
  assert.equal(cat.devices('videoinput').length, 2);
  assert.equal(cat.permission('videoinput'), 'granted');
});

test('refresh before any grant stays invisible to choosers', () => {
  const cat = new MediaDeviceCatalog();
  cat.refresh([cam('cam-1')]);
  assert.deepEqual(cat.devices('videoinput'), []);
});

test('video and audio permissions are independent', () => {
  const cat = new MediaDeviceCatalog();
  cat.grant('videoinput', [cam('cam-1')]);
  assert.equal(cat.permission('audioinput'), 'prompt');
  assert.deepEqual(cat.devices('audioinput'), []);
  cat.grant('audioinput', [mic('mic-1')]);
  assert.equal(cat.devices('videoinput').length, 1);
  assert.equal(cat.devices('audioinput').length, 1);
});

// --- camera lifecycle --------------------------------------------------------

test('REQUEST enters requesting; GRANTED goes live with the device id', () => {
  let s: CameraLifecycle = CAMERA_UNBOUND;
  s = stepCamera(s, { type: 'REQUEST' });
  assert.equal(s.phase, 'requesting');
  s = stepCamera(s, { type: 'GRANTED', deviceId: 'cam-1' });
  assert.deepEqual(s, { phase: 'live', deviceId: 'cam-1' });
});

test('DENIED parks; a new REQUEST re-prompts', () => {
  let s = stepCamera(CAMERA_UNBOUND, { type: 'REQUEST' });
  s = stepCamera(s, { type: 'DENIED' });
  assert.equal(s.phase, 'denied');
  assert.equal(stepCamera(s, { type: 'REQUEST' }).phase, 'requesting');
});

test('TRACK_ENDED only fires from live and retains the device id', () => {
  const live: CameraLifecycle = { phase: 'live', deviceId: 'cam-1' };
  assert.deepEqual(stepCamera(live, { type: 'TRACK_ENDED' }), { phase: 'lost', deviceId: 'cam-1' });
  for (const s of [CAMERA_UNBOUND, { phase: 'requesting', deviceId: null } as CameraLifecycle]) {
    assert.equal(stepCamera(s, { type: 'TRACK_ENDED' }), s);
  }
});

test('DETACH returns to unbound from any phase; a stale GRANTED after DETACH is ignored', () => {
  for (const phase of ['unbound', 'requesting', 'live', 'denied', 'lost'] as const) {
    const s: CameraLifecycle = { phase, deviceId: phase === 'live' || phase === 'lost' ? 'cam-1' : null };
    assert.deepEqual(stepCamera(s, { type: 'DETACH' }), CAMERA_UNBOUND);
  }
  let s = stepCamera(CAMERA_UNBOUND, { type: 'REQUEST' });
  s = stepCamera(s, { type: 'DETACH' });
  assert.equal(stepCamera(s, { type: 'GRANTED', deviceId: 'late' }).phase, 'unbound');
});

test('cameraFeedsKey is true only while live', () => {
  assert.equal(cameraFeedsKey({ phase: 'live', deviceId: 'cam-1' }), true);
  for (const phase of ['unbound', 'requesting', 'denied', 'lost'] as const) {
    assert.equal(cameraFeedsKey({ phase, deviceId: null }), false);
  }
});
