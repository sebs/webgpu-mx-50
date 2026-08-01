// Pure camera-attachment lifecycle (inputs-and-devices.feature, External Camera rule).
// The browser glue (CameraSource / CameraFeedController) feeds events in; the renderer
// gates on cameraFeedsKey. Headless and unit-tested — permission prompts, grants, device
// loss and detachment are all modelled as explicit transitions, so a stale getUserMedia
// resolution after a detach is structurally ignored.

export type CameraPhase = 'unbound' | 'requesting' | 'live' | 'denied' | 'lost';

export interface CameraLifecycle {
  readonly phase: CameraPhase;
  /** Granted device id while live; retained in 'lost' so glue can markUnavailable. */
  readonly deviceId: string | null;
}

export type CameraEvent =
  | { type: 'REQUEST' }
  | { type: 'GRANTED'; deviceId: string }
  | { type: 'DENIED' }
  | { type: 'TRACK_ENDED' }
  | { type: 'DETACH' };

export const CAMERA_UNBOUND: CameraLifecycle = { phase: 'unbound', deviceId: null };

export function stepCamera(s: CameraLifecycle, e: CameraEvent): CameraLifecycle {
  switch (e.type) {
    case 'REQUEST':
      if (s.phase === 'unbound' || s.phase === 'denied' || s.phase === 'lost') {
        return { phase: 'requesting', deviceId: null };
      }
      return s;
    case 'GRANTED':
      // Only a pending request may go live — a stale grant after DETACH is ignored
      // (the glue must stop the fresh tracks).
      return s.phase === 'requesting' ? { phase: 'live', deviceId: e.deviceId } : s;
    case 'DENIED':
      return s.phase === 'requesting' ? { phase: 'denied', deviceId: null } : s;
    case 'TRACK_ENDED':
      return s.phase === 'live' ? { phase: 'lost', deviceId: s.deviceId } : s;
    case 'DETACH':
      return CAMERA_UNBOUND;
  }
}

/** True only while a granted stream is delivering — the renderer's camera gate. */
export function cameraFeedsKey(s: CameraLifecycle): boolean {
  return s.phase === 'live';
}
