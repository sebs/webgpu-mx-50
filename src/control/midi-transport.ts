// MIDI transport (ADR-0020): the System Real-Time and Common messages a DAW sends as
// transport master — Start (FA), Continue (FB), Stop (FC), Timing Clock (F8, 24 per quarter
// note) and Song Position Pointer (F2, 14-bit count of sixteenths). Parsed into playhead
// positions in frames at the timeline's tempo, so scrubbing in Ableton (with "Sync" on the
// port) scrubs the demo. Pure: no clock of its own, the DAW's clocks are the time base.

export type TransportKind = 'start' | 'stop' | 'continue' | 'position' | 'clock';

export interface TransportEvent {
  readonly kind: TransportKind;
  /** Where the DAW's playhead is, in frames (60 per second) at the timeline tempo. */
  readonly frame: number;
}

/** MIDI clocks per sixteenth note (24 per quarter). */
const CLOCKS_PER_SIXTEENTH = 6;

export class MidiTransport {
  private sixteenths = 0;
  private clocks = 0;
  private running = false;

  constructor(private bpm: number) {}

  setBpm(bpm: number): void {
    this.bpm = bpm;
  }

  get isRunning(): boolean {
    return this.running;
  }

  /** Frames per MIDI clock: a quarter is 3600 / bpm frames, a clock 1/24 of that. */
  private frame(): number {
    return Math.round((this.sixteenths * CLOCKS_PER_SIXTEENTH + this.clocks) * (150 / this.bpm));
  }

  handle(data: Uint8Array | readonly number[]): TransportEvent | null {
    switch (data[0]) {
      case 0xf2:
        this.sixteenths = (data[1]! & 0x7f) | ((data[2]! & 0x7f) << 7);
        this.clocks = 0;
        return { kind: 'position', frame: this.frame() };
      case 0xfa:
        this.sixteenths = 0;
        this.clocks = 0;
        this.running = true;
        return { kind: 'start', frame: 0 };
      case 0xfb:
        this.running = true;
        return { kind: 'continue', frame: this.frame() };
      case 0xfc:
        this.running = false;
        return { kind: 'stop', frame: this.frame() };
      case 0xf8:
        if (!this.running) return null;
        this.clocks++;
        return { kind: 'clock', frame: this.frame() };
      default:
        return null;
    }
  }
}
