// Shared device-enumeration glue (browser-only, CI-excluded): post-grant enumeration and
// the devicechange subscription, used by the EXT.CAMERA monitor and the per-feed camera
// pickers. The headless model of these rules is MediaDeviceCatalog (device-catalog.ts).

export interface VideoInputInfo {
  readonly id: string;
  readonly label: string;
}

/** Post-grant enumeration; resolves [] when mediaDevices is unavailable. */
export async function listVideoInputs(): Promise<VideoInputInfo[]> {
  if (typeof navigator === 'undefined' || !navigator.mediaDevices) return [];
  try {
    const all = await navigator.mediaDevices.enumerateDevices();
    const out: VideoInputInfo[] = [];
    for (const d of all) {
      if (d.kind === 'videoinput') out.push({ id: d.deviceId, label: d.label });
    }
    return out;
  } catch {
    return [];
  }
}

/** Subscribe to 'devicechange'; returns an unsubscribe. */
export function onDeviceChange(handler: () => void): () => void {
  if (typeof navigator === 'undefined' || !navigator.mediaDevices) return () => undefined;
  navigator.mediaDevices.addEventListener('devicechange', handler);
  return () => navigator.mediaDevices.removeEventListener('devicechange', handler);
}
