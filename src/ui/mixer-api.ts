// The documented embedding surface of <mx-mixer> (ADR-0017): every attribute the host
// reads and every event it dispatches, as data. Kept DOM-free so the docs site and the
// unit suite can import it; test/unit/mixer-api.test.ts fails if mixer.ts reads an
// attribute or dispatches an event that is missing here, or if an entry here is never
// used by mixer.ts.

export interface MixerAttributeDoc {
  readonly name: string;
  /** The accepted value shape, e.g. 'integer', 'boolean', 'URL'. */
  readonly value: string;
  readonly description: string;
}

/**
 * Every attribute the host reads — the public embedding surface, documented next to the
 * code that reads it (a unit test fails if an attribute is read but missing here, or
 * listed here but never read). The docs site renders this table verbatim.
 */
export const MIXER_ATTRIBUTES: readonly MixerAttributeDoc[] = [
  { name: 'width', value: 'integer', description: 'Internal canvas width in pixels. Default 1280.' },
  { name: 'height', value: 'integer', description: 'Internal canvas height in pixels. Default 720.' },
  {
    name: 'persist',
    value: 'boolean',
    description:
      'Opt in to the storage tiers: localStorage scalars, IndexedDB stills, boot restore and preset file io. Absent means fully ephemeral — embedding never writes the page\'s storage.',
  },
  { name: 'src', value: 'URL', description: 'A clip bound to Source 1 on bus A with Program Out EFFECT — the single-tag playback case.' },
  {
    name: 'preset',
    value: 'URL',
    description: 'A preset file, fetched and routed through the same sanitising import path as a file import.',
  },
  { name: 'controls', value: 'boolean', description: 'Append the full operator console, like <video controls>.' },
  {
    name: 'feeds',
    value: '"pattern"',
    description: 'Bind the four procedural pattern feeds to Sources 1–4 (no assets, no network). They draw on the logical clock, so they pause with the loop.',
  },
  {
    name: 'run',
    value: '"visible"',
    description: 'Boot only once the host is first on screen, and pause the render loop whenever it is off screen or the tab is hidden.',
  },
  {
    name: 'shared-device',
    value: 'boolean',
    description: 'Share one GPUDevice with every other host on the page that sets it, instead of acquiring a device per host.',
  },
];

export interface MixerEventDoc {
  readonly name: string;
  readonly detail: string;
  readonly description: string;
}

/** Every event the host dispatches (same drift guard as MIXER_ATTRIBUTES). */
export const MIXER_EVENTS: readonly MixerEventDoc[] = [
  {
    name: 'mx-ready',
    detail: 'MixerContext',
    description: 'Dispatched synchronously before the first frame — bind real sources into the registry here and no wrong-source frame is ever shown.',
  },
  {
    name: 'mx-unavailable',
    detail: 'string (message)',
    description: 'WebGPU is missing or failed to start. Cancelable: preventDefault() suppresses the inline fallback message.',
  },
  { name: 'mx-preset-error', detail: 'string (reason)', description: 'A preset URL or loadPreset() payload was rejected.' },
];

export interface MixerMemberDoc {
  readonly name: string;
  /** Signature as an embedder writes it. */
  readonly signature: string;
  readonly description: string;
}

/** The element's public members, for composition roots (never transported by the context). */
export const MIXER_MEMBERS: readonly MixerMemberDoc[] = [
  { name: 'whenReady', signature: 'whenReady(): Promise<MixerContext>', description: 'Resolves once the host is running (after mx-ready).' },
  { name: 'dispatch', signature: 'dispatch(command: Command): void', description: 'The store\'s one write path — every panel change is a typed command.' },
  { name: 'loadPreset', signature: 'loadPreset(json: string): boolean', description: 'Make a preset file live through the sanitising import path; false (and mx-preset-error) when rejected.' },
  { name: 'exportPreset', signature: 'exportPreset(): string | null', description: 'The current panel as a field-preset file — the JSON loadPreset() accepts.' },
  { name: 'onFrame', signature: 'onFrame(fn: (state, tick) => void): Unsubscribe', description: 'Called after each rendered frame with the snapshot that was presented.' },
  { name: 'beforeFrame', signature: 'beforeFrame(fn: (tick) => void): Unsubscribe', description: 'Called before the timeline advances — where input pumping (MIDI, gamepad) belongs.' },
  { name: 'context', signature: 'context: MixerContext | null', description: 'The context components receive, or null before boot.' },
  { name: 'registry', signature: 'registry: SourceRegistry | null', description: 'The Source slots; set() a slot to swap its picture, race-free, any time after mx-ready.' },
  { name: 'engine', signature: 'engine: Engine | null', description: 'The headless engine: store, logical clock, source bindings.' },
  { name: 'avPulse', signature: 'avPulse: ((state) => AvSynchroEffect[]) | null', description: 'Seam for a page-owned A/V Synchro measurement.' },
  { name: 'feedTick', signature: 'feedTick: ((tick) => number) | null', description: 'Clock for the feeds="pattern" pictures; a MIDI timeline maps it to its playhead so scrubbing moves the picture.' },
];

/** What every connected component receives — and all it receives (ADR-0017). */
export const MIXER_CONTEXT_MEMBERS: readonly MixerMemberDoc[] = [
  { name: 'store', signature: 'store: PanelStore', description: 'dispatch(command), subscribe(fn), getSnapshot() — the one-way store.' },
  { name: 'tick', signature: 'tick(): number', description: 'The current logical tick (60 per second, display-rate independent).' },
  { name: 'presetIo', signature: 'presetIo: PresetFileIo | null', description: 'Preset file save/load glue; null unless the host has persist.' },
  { name: 'onFrame', signature: 'onFrame(fn): Unsubscribe', description: 'Display-cadence hook, called after each rendered frame.' },
];
