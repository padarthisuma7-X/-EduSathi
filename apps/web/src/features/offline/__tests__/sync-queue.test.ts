import type { SyncBatchRequest, SyncBatchResponse, SyncQueueItem } from '@sahaj/shared/domain';

import { createMemoryQueueStorage, type QueueStorage } from '../queue-storage';
import { SyncQueue, type SyncQueueSnapshot } from '../sync-queue';

/**
 * The offline queue is the module a child's work depends on, so the engine is
 * tested directly against the in-memory storage: every ordering, idempotency and
 * failure property here is the same code path IndexedDB serves in the browser.
 */

function buildQueue(
  transport: (batch: SyncBatchRequest) => Promise<SyncBatchResponse>,
): { queue: SyncQueue; storage: QueueStorage } {
  const storage = createMemoryQueueStorage();
  return { queue: new SyncQueue(storage, transport), storage };
}

const OK: SyncBatchResponse = {
  results: [],
  acknowledgedCursor: 0,
  serverTime: '2026-02-01T10:00:00.000Z',
};

/** A transport that accepts everything, echoing the server's real behaviour. */
function acceptingTransport(batch: SyncBatchRequest): Promise<SyncBatchResponse> {
  return Promise.resolve({
    results: batch.items.map((item) => ({ clientId: item.clientId, status: 'accepted' as const })),
    // The server acknowledges contiguously from the client cursor.
    acknowledgedCursor: batch.cursor + batch.items.length,
    serverTime: '2026-02-01T10:00:00.000Z',
  });
}

describe('SyncQueue', () => {
  it('persists an enqueue before any network is involved', async () => {
    const { queue } = buildQueue(acceptingTransport);
    await queue.configure('device-1');
    await queue.enqueue('quiz-attempt', { answer: 1 });

    const snapshot = await queue.getSnapshot();
    expect(snapshot.pending).toBe(1);
    expect(snapshot.deviceId).toBe('device-1');
  });

  it('hands out monotonically increasing sequence numbers per device', async () => {
    const storage = createMemoryQueueStorage();
    const queue = new SyncQueue(storage, acceptingTransport);
    await queue.configure('device-1');
    await queue.enqueue('quiz-attempt', { answer: 1 });
    await queue.enqueue('quiz-attempt', { answer: 2 });
    await queue.enqueue('progress-event', { minutes: 3 });

    const snapshot = await queue.getSnapshot();
    expect(snapshot.pending).toBe(3);

    // Sequence ordering is what the server's cursor logic depends on; assert it
    // from the persisted items rather than trusting the queue's own accounting.
    const pending: SyncQueueItem[] = await storage.list();
    expect(pending.map((item) => item.sequence)).toEqual([1, 2, 3]);
  });

  it('flushes in order and clears the queue on success', async () => {
    const seen: SyncBatchRequest[] = [];
    const { queue } = buildQueue(async (batch) => {
      seen.push(batch);
      return acceptingTransport(batch);
    });
    await queue.configure('device-1');
    await queue.enqueue('quiz-attempt', { answer: 1 });
    await queue.enqueue('quiz-attempt', { answer: 2 });

    const snapshot = await queue.flush();
    expect(snapshot.pending).toBe(0);
    expect(snapshot.cursor).toBe(2);
    expect(snapshot.lastProblem).toBeNull();
    expect(seen[0]?.items.map((item) => item.sequence)).toEqual([1, 2]);
    expect(seen[0]?.cursor).toBe(0);
  });

  it('treats a duplicate verdict as safe-to-drop', async () => {
    // The classic three-days-offline replay: the server already has the item
    // from a partial sync, answers `duplicate`, and the queue must clear it.
    const { queue } = buildQueue(async (batch) => ({
      results: batch.items.map((item) => ({ clientId: item.clientId, status: 'duplicate' as const })),
      acknowledgedCursor: batch.cursor + batch.items.length,
      serverTime: OK.serverTime,
    }));
    await queue.configure('device-1');
    await queue.enqueue('quiz-attempt', {});

    const snapshot = await queue.flush();
    expect(snapshot.pending).toBe(0);
    expect(snapshot.status).toBe('idle');
  });

  it('drops rejected items, keeps the rest of the batch, and says so', async () => {
    const { queue } = buildQueue(async (batch) => ({
      results: batch.items.map((item, index) =>
        index === 0
          ? { clientId: item.clientId, status: 'accepted' as const }
          : { clientId: item.clientId, status: 'rejected' as const, message: 'The attempt has no answers.' },
      ),
      acknowledgedCursor: batch.cursor + 1,
      serverTime: OK.serverTime,
    }));
    await queue.configure('device-1');
    await queue.enqueue('quiz-attempt', { good: true });
    await queue.enqueue('quiz-attempt', { bad: true });

    const snapshot = await queue.flush();
    expect(snapshot.pending).toBe(0);
    expect(snapshot.status).toBe('rejected');
    expect(snapshot.lastProblem).toMatch(/not accepted.*no answers/s);
  });

  it('keeps items and backs off when the network fails', async () => {
    let calls = 0;
    const { queue } = buildQueue(async () => {
      calls += 1;
      throw new Error('ECONNREFUSED');
    });
    await queue.configure('device-1');
    await queue.enqueue('quiz-attempt', {});

    const snapshot = await queue.flush();
    expect(calls).toBe(1);
    expect(snapshot.pending).toBe(1);
    expect(snapshot.status).toBe('error');
    expect(snapshot.lastProblem).toMatch(/saved/i);

    // Backoff: an immediate non-forced flush must not hit the transport again.
    await queue.flush();
    expect(calls).toBe(1);

    // Forced flush bypasses the backoff (the "Sync now" button).
    await queue.flush(true);
    expect(calls).toBe(2);
  });

  it('records attempt counts on the persisted items after a failure', async () => {
    const { queue, storage } = buildQueue(async () => {
      throw new Error('offline');
    });
    await queue.configure('device-1');
    await queue.enqueue('quiz-attempt', {});

    await queue.flush();
    await queue.flush(true);

    const items: SyncQueueItem[] = await storage.list();
    expect(items[0]?.attempts).toBe(2);
    expect(items[0]?.lastAttemptAt).toBeTruthy();
  });

  it('serialises concurrent flushes instead of double-sending', async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    const { queue } = buildQueue(async (batch) => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 5));
      inFlight -= 1;
      return acceptingTransport(batch);
    });
    await queue.configure('device-1');
    await queue.enqueue('quiz-attempt', {});

    await Promise.all([queue.flush(), queue.flush(), queue.flush()]);
    expect(maxInFlight).toBe(1);
  });

  it('reports a synchronous snapshot for React without awaiting storage', async () => {
    const { queue } = buildQueue(acceptingTransport);
    await queue.configure('device-2');
    await queue.enqueue('quiz-attempt', {});

    const cached: SyncQueueSnapshot = queue.getCachedSnapshot();
    expect(cached.pending).toBe(1);
    expect(cached.deviceId).toBe('device-2');
    expect(cached.status).toBe('idle');
  });

  it('notifies subscribers when items change', async () => {
    const { queue } = buildQueue(acceptingTransport);
    await queue.configure('device-1');
    let notifications = 0;
    queue.subscribe(() => {
      notifications += 1;
    });

    await queue.enqueue('quiz-attempt', {});
    expect(notifications).toBeGreaterThan(0);
  });
});
