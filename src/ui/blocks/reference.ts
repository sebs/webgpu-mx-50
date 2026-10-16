// Provenance for each connected block: the hardware block letter, the section of
// docs/wj-mx50-feature-reference.md it implements, the feature file that pins it, and a
// one-line summary. One table, three readers: the block chrome (header tooltip), the
// console's Explain mode, and the docs site's block reference — so a citation cannot
// say one thing on the panel and another on the site. A unit test keeps it in step with
// the block registry and checks every feature file named here exists.

export interface BlockReference {
  /** The hardware's own block id, as printed on the panel chrome. */
  readonly block: string;
  readonly title: string;
  /** Section of docs/wj-mx50-feature-reference.md, e.g. '§10'. */
  readonly section: string;
  /** The feature file (under features/) that pins the block's behaviour. */
  readonly feature: string;
  readonly summary: string;
}

export const BLOCK_REFERENCE: Readonly<Record<string, BlockReference>> = {
  'mx-source-block': {
    block: 'B-1',
    title: 'Source selection',
    section: '§2–§3',
    feature: 'source-selection.feature',
    summary: 'Pick what each bus carries — four Sources or the Matte — and what Program Out sends: the effected composite or a clean bus.',
  },
  'mx-matte-block': {
    block: 'B-2',
    title: 'Matte generator',
    section: '§4',
    feature: 'matte-generator.feature',
    summary: 'Nine internal colours, a LEVEL whose meaning depends on the colour, and a vertical gradation.',
  },
  'mx-audio-block': {
    block: 'B-3',
    title: 'Audio mixer',
    section: '§5, §12',
    feature: 'audio-mixer.feature',
    summary: 'Seven inputs on faders into a master, with Audio Follow tying the A/B crossfade to the lever.',
  },
  'mx-colour-correction-block': {
    block: 'B-4',
    title: 'Colour correction',
    section: '§6',
    feature: 'color-correction.feature',
    summary: 'Per-bus CHROMA and an RGB joystick; one button cycles off → chroma → chroma + joystick.',
  },
  'mx-position-block': {
    block: 'B-5',
    title: 'Positioner',
    section: '§7',
    feature: 'position-and-scene-grabber.feature',
    summary: 'Place a Square-wipe inset anywhere with the joystick, and freeze its contents with SCENE GRABBER.',
  },
  'mx-digital-effect-block': {
    block: 'C',
    title: 'Digital effect',
    section: '§8.1–§8.4',
    feature: 'digital-effects-filters.feature',
    summary: 'Nega, Mosaic, Mono and Paint on one bus at a time — armed by choosing, live only once ON is pressed.',
  },
  'mx-freeze-block': {
    block: 'C',
    title: 'Freeze / frame',
    section: '§8.5–§8.10',
    feature: 'digital-effect-still.feature',
    summary: 'Still, Strobe, Multi and Trail — the frame-memory effects — plus A/V Synchro and the Frame button.',
  },
  'mx-mixwipe-block': {
    block: 'D',
    title: 'Mix / wipe',
    section: '§9',
    feature: 'transition-mix-nam.feature',
    summary: 'The lever and the transition types: Mix, NAM, the wipe engine, and the luminance and chroma keys.',
  },
  'mx-dsk-block': {
    block: 'E',
    title: 'Downstream key',
    section: '§10',
    feature: 'downstream-key.feature',
    summary: 'A title keyed over the finished composite: a level window, a fill, a key source, six edge styles and reverse.',
  },
  'mx-fade-block': {
    block: 'F',
    title: 'Fade control',
    section: '§11',
    feature: 'fade-control.feature',
    summary: 'The last stage: fade Video, DSK and Audio independently to Matte, White, Black or a clean bus.',
  },
  'mx-memory-block': {
    block: 'H',
    title: 'Event memory',
    section: '§13–§15',
    feature: 'event-memory.feature',
    summary: 'Eight panel snapshots to store, recall and sequence, the Special Mode macro bank, and Auto Take.',
  },
};

/** The tooltip line a block header carries, e.g. 'E · reference §10 · features/downstream-key.feature'. */
export function referenceLine(ref: BlockReference): string {
  return `${ref.block} · reference ${ref.section} · features/${ref.feature}`;
}
