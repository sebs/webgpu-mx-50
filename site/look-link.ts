// "Copy link to this look": a bench's current panel travels in the page URL as
// `?look=<benchId>.<base64url(preset json)>#<benchId>`. The payload is a plain ADR-0015
// field-preset file, so restoring it goes through the mixer's normal sanitising import
// (loadPreset) — a hand-edited or truncated link is rejected there, never trusted.
//
// Pure (no DOM): btoa/atob and TextEncoder/TextDecoder exist in browsers and in Node.

export const LOOK_PARAM = 'look';

function toBase64Url(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]!);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(encoded: string): string | null {
  if (!/^[A-Za-z0-9_-]*$/.test(encoded)) return null;
  let b64 = encoded.replace(/-/g, '+').replace(/_/g, '/');
  while (b64.length % 4) b64 += '=';
  try {
    const binary = atob(b64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return null;
  }
}

/** The `look` parameter value for a bench and its preset JSON. */
export function encodeLook(benchId: string, presetJson: string): string {
  return `${benchId}.${toBase64Url(presetJson)}`;
}

/** Split a `look` parameter value back into bench id and preset JSON; null when malformed. */
export function decodeLook(value: string): { benchId: string; json: string } | null {
  const dot = value.indexOf('.');
  if (dot <= 0) return null;
  const json = fromBase64Url(value.slice(dot + 1));
  return json === null ? null : { benchId: value.slice(0, dot), json };
}

/** A shareable URL for `pageUrl` that restores `presetJson` into bench `benchId`. */
export function lookUrl(pageUrl: string, benchId: string, presetJson: string): string {
  const url = new URL(pageUrl);
  url.searchParams.set(LOOK_PARAM, encodeLook(benchId, presetJson));
  url.hash = benchId;
  return url.href;
}

/** The preset JSON a URL carries for `benchId`, or null. */
export function lookFor(pageUrl: string, benchId: string): string | null {
  const value = new URL(pageUrl).searchParams.get(LOOK_PARAM);
  if (!value) return null;
  const decoded = decodeLook(value);
  return decoded && decoded.benchId === benchId ? decoded.json : null;
}
