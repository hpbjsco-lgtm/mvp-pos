/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { SyncRequestError } from './syncClient';
import type { SyncRunResult } from './syncEngine';

/** What the status badge shows. */
export interface SyncStatus {
  /** `syncing` while a round runs; `offline` when the server could not be reached; `error` when the server refused or answered badly. */
  state: 'idle' | 'syncing' | 'offline' | 'error';
  /** Records waiting for upload. */
  pending: number;
  /** Unresolved conflicts of the store, from the last successful round. */
  pendingConflicts: number;
  /** Time of the last successful round (milliseconds), or null before the first one. */
  lastSyncedAt: number | null;
  /** Readable reason when `state` is `offline` or `error`; empty otherwise. */
  message: string;
}

/** What the scheduler needs from the rest of the app. */
export interface SchedulerDeps {
  /** Runs one synchronisation round. */
  runRound(): Promise<SyncRunResult>;
  /** Counts records waiting for upload. */
  pendingCount(): Promise<number>;
  /** Current time in milliseconds. */
  now(): number;
}

/** Timing of the scheduler. */
export interface SchedulerOptions {
  /** How often it looks for local changes to upload. */
  pollMs?: number;
  /** Longest time between two rounds even without local changes (to download what other devices did). */
  fullRoundMs?: number;
  /** Longest wait between attempts after failures. */
  maxBackoffMs?: number;
}

/**
 * Decides when to run synchronisation rounds: soon after a local change, at least every `fullRoundMs`, and at
 * once when asked (network back, app in front again). After a failure it waits longer each time, so a server that
 * is down is not hit every few seconds.
 */
export class SyncScheduler {
  private status: SyncStatus = { state: 'idle', pending: 0, pendingConflicts: 0, lastSyncedAt: null, message: '' };
  private readonly statusListeners = new Set<(status: SyncStatus) => void>();
  private readonly changeListeners = new Set<(tables: string[]) => void>();
  private timer: ReturnType<typeof setTimeout> | undefined;
  private stopped = true;
  private running = false;
  private forced = false;
  private failures = 0;
  private lastAttemptAt = 0;
  private nextAllowedAt = 0;
  private readonly pollMs: number;
  private readonly fullRoundMs: number;
  private readonly maxBackoffMs: number;

  /**
   * @param deps Rounds, queue size and clock.
   * @param options Timing.
   */
  constructor(private readonly deps: SchedulerDeps, options: SchedulerOptions = {}) {
    this.pollMs = options.pollMs ?? 5000;
    this.fullRoundMs = options.fullRoundMs ?? 30000;
    this.maxBackoffMs = options.maxBackoffMs ?? 60000;
  }

  /** Starts the loop; the first round runs at once. */
  start(): void {
    if (!this.stopped) return;
    this.stopped = false;
    this.forced = true;
    void this.tick();
  }

  /** Stops the loop; a round that is running finishes. */
  stop(): void {
    this.stopped = true;
    clearTimeout(this.timer);
  }

  /**
   * Asks for a round now (network came back, app in front again, person pressed "Đồng bộ ngay"). A pause after
   * failures is ended.
   */
  requestRound(): void {
    if (this.stopped) return;
    this.forced = true;
    this.nextAllowedAt = 0;
    clearTimeout(this.timer);
    void this.tick();
  }

  /**
   * @returns The current status.
   */
  getStatus(): SyncStatus {
    return this.status;
  }

  /**
   * @param listener Called with every new status.
   * @returns Function that removes the listener.
   */
  subscribe(listener: (status: SyncStatus) => void): () => void {
    this.statusListeners.add(listener);
    return () => { this.statusListeners.delete(listener); };
  }

  /**
   * @param listener Called with the tables whose rows changed on this device after a round (to reload screens).
   * @returns Function that removes the listener.
   */
  onChanged(listener: (tables: string[]) => void): () => void {
    this.changeListeners.add(listener);
    return () => { this.changeListeners.delete(listener); };
  }

  /** Looks at the queue and runs a round when one is due, then plans the next look. */
  private async tick(): Promise<void> {
    if (this.stopped || this.running) return;
    const now = this.deps.now();
    let pending = this.status.pending;
    try {
      pending = await this.deps.pendingCount();
    } catch (error) {
      this.setStatus({ state: 'error', message: (error as Error).message });
      this.schedule();
      return;
    }
    if (pending !== this.status.pending) this.setStatus({ pending });

    const due = this.forced || pending > 0 || now - this.lastAttemptAt >= this.fullRoundMs;
    if (due && now >= this.nextAllowedAt) await this.runRound();
    this.schedule();
  }

  /** Runs a round and records its outcome. */
  private async runRound(): Promise<void> {
    this.running = true;
    this.forced = false;
    this.lastAttemptAt = this.deps.now();
    this.setStatus({ state: 'syncing', message: '' });
    try {
      const result = await this.deps.runRound();
      this.failures = 0;
      this.nextAllowedAt = 0;
      this.setStatus({
        state: 'idle', message: '', pendingConflicts: result.pendingConflicts, lastSyncedAt: this.deps.now(),
        pending: await this.deps.pendingCount(),
      });
      if (result.changedTables.length > 0) this.changeListeners.forEach(listener => listener(result.changedTables));
    } catch (error) {
      this.failures += 1;
      this.nextAllowedAt = this.deps.now() + Math.min(this.maxBackoffMs, this.pollMs * 2 ** this.failures);
      const answered = error instanceof SyncRequestError;
      this.setStatus({ state: answered ? 'error' : 'offline', message: (error as Error).message });
    } finally {
      this.running = false;
    }
  }

  /** Plans the next look at the queue. */
  private schedule(): void {
    clearTimeout(this.timer);
    if (!this.stopped) this.timer = setTimeout(() => { void this.tick(); }, this.pollMs);
  }

  /**
   * @param patch Fields to change.
   */
  private setStatus(patch: Partial<SyncStatus>): void {
    this.status = { ...this.status, ...patch };
    this.statusListeners.forEach(listener => listener(this.status));
  }
}
