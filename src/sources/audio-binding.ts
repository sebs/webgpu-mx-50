// Which audio provider backs each auxiliary audio channel (inputs-and-devices.feature,
// Rule "Auxiliary audio inputs bind to audio input devices or audio files"). The browser
// reinterpretation of the hardware's AUX 1 / AUX 2 / MIC jacks: each channel holds exactly
// one binding to a microphone device, a line-in device, or an audio file. Pure and
// headless (no DOM, no AudioContext) — exercised directly by the Gherkin specs; the Web
// Audio engine consumes the bindings as ids resolved outside the store (ADR-0008).

export type AudioChannel = 'aux1' | 'aux2' | 'mic';
export type AudioProviderKind = 'mic-device' | 'line-device' | 'audio-file';

export interface AudioBinding {
  readonly kind: AudioProviderKind;
  readonly providerId: string;
  /** False when the backing device was lost/disconnected. */
  available: boolean;
}

export class AudioInputBindingRegistry {
  private readonly bindings = new Map<AudioChannel, AudioBinding>();

  /** Bind a channel to a provider, replacing any previous binding for that channel. */
  bind(channel: AudioChannel, kind: AudioProviderKind, providerId: string): AudioBinding {
    const binding: AudioBinding = { kind, providerId, available: true };
    this.bindings.set(channel, binding);
    return binding;
  }

  get(channel: AudioChannel): AudioBinding | undefined {
    return this.bindings.get(channel);
  }

  isBound(channel: AudioChannel): boolean {
    return this.bindings.has(channel);
  }

  clear(channel: AudioChannel): void {
    this.bindings.delete(channel);
  }

  /** Mark every channel backed by this provider as unavailable (device disconnected). */
  markUnavailable(providerId: string): void {
    for (const binding of this.bindings.values()) {
      if (binding.providerId === providerId) binding.available = false;
    }
  }
}
