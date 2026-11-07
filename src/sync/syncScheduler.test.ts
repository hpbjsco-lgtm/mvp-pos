/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SyncRequestError } from './syncClient';
import type { SyncRunResult } from './syncEngine';
import { SyncScheduler } from './syncScheduler';

const result = (patch: Partial<SyncRunResult> = {}): SyncRunResult => ({
  uploaded: 0, alreadyKnown: 0, conflicts: 0, downloaded: 0, pendingConflicts: 0, changedTables: [], ...patch,
});

/** Lets promises and the zero-delay work of a timer finish. */
const settle = () => vi.advanceTimersByTimeAsync(0);

describe('SyncScheduler', () => {
  let pending = 0;
  let runRound: ReturnType<typeof vi.fn<() => Promise<SyncRunResult>>>;
  let scheduler: SyncScheduler;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-07T10:00:00Z'));
    pending = 0;
    runRound = vi.fn(async () => result());
    scheduler = new SyncScheduler({ runRound, pendingCount: async () => pending, now: () => Date.now() }, { pollMs: 5000, fullRoundMs: 30000, maxBackoffMs: 60000 });
  });
  afterEach(() => { scheduler.stop(); vi.useRealTimers(); });

  it('runs a round at start and reports the device as in step', async () => {
    scheduler.start();
    await settle();
    expect(runRound).toHaveBeenCalledTimes(1);
    expect(scheduler.getStatus()).toMatchObject({ state: 'idle', pending: 0, message: '' });
    expect(scheduler.getStatus().lastSyncedAt).not.toBeNull();
  });

  it('does not run again until something changed or the full interval passed', async () => {
    scheduler.start();
    await settle();
    await vi.advanceTimersByTimeAsync(20000);
    expect(runRound).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(10000);
    expect(runRound).toHaveBeenCalledTimes(2);
  });

  it('uploads soon after a local change', async () => {
    scheduler.start();
    await settle();
    pending = 2;
    runRound.mockImplementationOnce(async () => { pending = 0; return result({ uploaded: 2 }); });
    await vi.advanceTimersByTimeAsync(5000);
    expect(runRound).toHaveBeenCalledTimes(2);
    expect(scheduler.getStatus().pending).toBe(0);
  });

  it('shows the queue size while the server cannot be reached and waits longer after each failure', async () => {
    pending = 3;
    runRound.mockRejectedValue(new Error('Không kết nối được máy chủ'));
    scheduler.start();
    await settle();
    expect(scheduler.getStatus()).toMatchObject({ state: 'offline', pending: 3, message: 'Không kết nối được máy chủ' });
    expect(runRound).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(10000); // first pause is 10 s
    expect(runRound).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(15000); // second pause is 20 s
    expect(runRound).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(10000);
    expect(runRound).toHaveBeenCalledTimes(3);
  });

  it('ends the pause when asked to run now, for example when the network is back', async () => {
    runRound.mockRejectedValueOnce(new Error('offline'));
    scheduler.start();
    await settle();
    expect(scheduler.getStatus().state).toBe('offline');
    scheduler.requestRound();
    await settle();
    expect(runRound).toHaveBeenCalledTimes(2);
    expect(scheduler.getStatus().state).toBe('idle');
  });

  it('calls an answer of the server an error, not an offline state', async () => {
    runRound.mockRejectedValueOnce(new SyncRequestError('Máy chủ từ chối mã API.', 'UNAUTHORIZED', 401));
    scheduler.start();
    await settle();
    expect(scheduler.getStatus()).toMatchObject({ state: 'error', message: 'Máy chủ từ chối mã API.' });
  });

  it('passes the changed tables and the conflict count on', async () => {
    const changed = vi.fn();
    scheduler.onChanged(changed);
    runRound.mockResolvedValueOnce(result({ changedTables: ['orders'], pendingConflicts: 2 }));
    scheduler.start();
    await settle();
    expect(changed).toHaveBeenCalledWith(['orders']);
    expect(scheduler.getStatus().pendingConflicts).toBe(2);
  });

  it('does not change screens when nothing changed, and stops when asked', async () => {
    const changed = vi.fn();
    scheduler.onChanged(changed);
    scheduler.start();
    await settle();
    expect(changed).not.toHaveBeenCalled();
    scheduler.stop();
    pending = 5;
    await vi.advanceTimersByTimeAsync(60000);
    expect(runRound).toHaveBeenCalledTimes(1);
  });
});
