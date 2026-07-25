// The single source-of-truth panel store (ADR-0011). One PanelState, one write path
// (`dispatch`), immutable snapshots produced by the pure reducer, and read-only
// subscribers notified after each commit. The render loop pulls `getSnapshot()` once
// per frame (ADR-0012) and never calls into the UI; the UI only dispatches commands.

import { reduce } from './reducer.js';
import type { PanelState } from './state.js';
import type { Command } from './commands.js';

export type Subscriber = (next: PanelState, prev: PanelState) => void;
export type Unsubscribe = () => void;

export class PanelStore {
  private state: PanelState;
  private readonly subscribers = new Set<Subscriber>();

  constructor(initial: PanelState) {
    this.state = initial;
  }

  /** The current immutable snapshot. Safe to hold for the duration of a frame. */
  getSnapshot(): PanelState {
    return this.state;
  }

  /** The only write path. Applies one command, commits a new snapshot, notifies. */
  dispatch(command: Command): void {
    const prev = this.state;
    const next = reduce(prev, command);
    if (next === prev) return; // no-op command produced no change
    this.state = next;
    for (const subscriber of this.subscribers) {
      subscriber(next, prev);
    }
  }

  /** Register a read-only observer. Observers react by dispatching, never by mutating. */
  subscribe(subscriber: Subscriber): Unsubscribe {
    this.subscribers.add(subscriber);
    return () => {
      this.subscribers.delete(subscriber);
    };
  }
}
