/**
 * The offline sync queue engine (Module 4).
 *
 * Answers a child gives while offline are recorded *locally first* and uploaded
 * later — the UI never waits for a network that may not exist. This class owns
 * the policy that makes a three-day offline gap safe:
 *
 *  - **Local-first.** `enqueue` persists before resolving; nothing is ever only
 *    in memory, so a killed browser loses no work.
 *  - **Ordered.** Each device hands out a monotonically increasing `sequence`;
 *    the server refuses to advance its cursor past a gap, so a failed upload
 *    blocks later ones from being *acknowledged* (they are still stored).
 *  - **Idempotent.** Items carry a client-generated `clientId`; a replay answers
 *    `duplicate`, which is what lets the device clear the item safely.
 *  - **Rejection is not failure.** A 4xx from the server means the *data* is bad
 *    (implausible latency, missing learner) and retrying can never succeed, so
 *    the item is dropped and the reason surfaced. A transport error means the
 *    *network* is bad and the item stays, with exponential backoff.
 *
 * The class is storage- and transport-agnostic; `SyncProvider` wires it to
 * IndexedDB and `fetch`, and tests wire it to memory and a fake.
 */

import type { SyncBatchRequest, SyncBatchResponse, SyncEntityType, SyncQueueItem } from '@sahaj/shared/domain';

import type { QueueConfig, QueueStorage } from './queue-storage';

export type SyncTransport = (batch: SyncBatchRequest) => Promise<SyncBatchResponse>;

export type SyncQueueStatus = 'idle' | 'syncing' | 'error' | 'rejected';

export interface SyncQueueSnapshot {
  /** Items still waiting to leave the device. */
  pending: number;
  /** Highest contiguous sequence the server has acknowledged. */
  cursor: number;
  deviceId: string;
  status: SyncQueueStatus;
  /** ISO time of the last transport that reached a verdict (not attempts). */
  lastSyncAt: string | null;
  /**
   * The latest thing that went wrong, in teacher-facing words. Null when the
   * last flush was clean. Deliberately *not* rendered as an error inside the
   * learner UI; the offline page treats it as status.
   */
  lastProblem: string | null;
}

/** Items are uploaded in chunks small enough for a 2G connection. */
const MAX_BATCH_ITEMS = 50;
const BASE_BACKOFF_MS = 30_000;
const MAX_BACKOFF_MS = 15 * 60_000;

export class SyncQueue {
  private readonly storage: QueueStorage;
  private readonly transport: SyncTransport;
  private readonly now: () => Date;
  private readonly maxBatch: number;
  private config: QueueConfig | null = null;
  private loaded = false;
  private flushing = false;
  private lastSyncAt: string | null = null;
  private lastProblem: string | null = null;
  private status: SyncQueueStatus = 'idle';
  private nextAttemptAt = 0;
  private pendingCount = 0;
  private readonly listeners = new Set<() => void>();

  constructor(
    storage: QueueStorage,
    transport: SyncTransport,
    options: { now?: () => Date; maxBatch?: number } = {},
  ) {
    this.storage = storage;
    this.transport = transport;
    this.now = options.now ?? (() => new Date());
    this.maxBatch = options.maxBatch ?? MAX_BATCH_ITEMS;
  }

  /** React integration: subscribe to snapshot changes (cheap, no polling). */
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify(): void {
    for (const listener of this.listeners) listener();
  }

  private async ensureLoaded(): Promise<QueueConfig> {
    if (!this.loaded) {
      this.config = await this.storage.getConfig();
      this.loaded = true;
    }
    if (!this.config) {
      // The deviceId comes from lib/device.ts at the call site (provider), kept
      // out of the engine so tests stay deterministic.
      throw new Error('SyncQueue used before configure() was called.');
    }
    return this.config;
  }

  async configure(deviceId: string): Promise<void> {
    const existing = await this.storage.getConfig();
    if (existing) {
      this.config = existing;
    } else {
      this.config = { deviceId, cursor: 0, sequence: 0 };
      await this.storage.setConfig(this.config);
    }
    this.loaded = true;
    this.pendingCount = (await this.storage.list()).length;
    this.notify();
  }

  /**
   * Persists a payload for later upload. Resolves once the item is durable —
   * callers may treat "enqueue resolved" as "this answer cannot be lost".
   */
  async enqueue(entityType: SyncEntityType, payload: unknown): Promise<void> {
    const config = await this.ensureLoaded();
    const item: SyncQueueItem = {
      clientId: generateClientId(),
      entityType,
      sequence: config.sequence + 1,
      createdAt: this.now().toISOString(),
      payload,
      attempts: 0,
    };
    config.sequence = item.sequence;
    await this.storage.put(item);
    await this.storage.setConfig(config);
    this.pendingCount += 1;
    this.notify();
  }

  /**
   * Synchronous snapshot for `useSyncExternalStore`. The pending count is
   * maintained by the queue itself (it is the only writer to its storage), so
   * React never has to await an IndexedDB read to render the badge.
   */
  getCachedSnapshot(): SyncQueueSnapshot {
    return {
      pending: this.pendingCount,
      cursor: this.config?.cursor ?? 0,
      deviceId: this.config?.deviceId ?? '',
      status: this.status,
      lastSyncAt: this.lastSyncAt,
      lastProblem: this.lastProblem,
    };
  }

  async getSnapshot(): Promise<SyncQueueSnapshot> {
    const config = await this.ensureLoaded();
    const pending = (await this.storage.list()).length;
    return {
      pending,
      cursor: config.cursor,
      deviceId: config.deviceId,
      status: this.status,
      lastSyncAt: this.lastSyncAt,
      lastProblem: this.lastProblem,
    };
  }

  /**
   * Uploads whatever is pending. Safe to call concurrently and repeatedly: while
   * one flush runs, others no-op; backoff makes eager callers (online event,
   * visibility change, after-enqueue) cheap.
   *
   * @param force bypass backoff — used when the user explicitly asks to sync.
   */
  async flush(force = false): Promise<SyncQueueSnapshot> {
    // Claim the flush BEFORE any await: with the check and the claim separated
    // by awaits, three eager callers (online event, visibility, after-enqueue)
    // all pass the check during each other's microtasks and triple-send the
    // same batch. A synchronous claim makes the concurrent calls no-ops.
    if (this.flushing) return this.getSnapshot();
    if (!force && Date.now() < this.nextAttemptAt) return this.getSnapshot();
    this.flushing = true;
    this.notify();

    try {
      const config = await this.ensureLoaded();
      const items = (await this.storage.list()).sort((a, b) => a.sequence - b.sequence);
      if (items.length === 0) {
        this.status = 'idle';
        this.lastProblem = null;
        return this.getSnapshot();
      }

      this.status = 'syncing';
      this.notify();

      try {
        const batch: SyncBatchRequest = {
          deviceId: config.deviceId,
          cursor: config.cursor,
          items: items.slice(0, this.maxBatch),
        };
        const response = await this.transport(batch);
        const hadRejections = await this.applyVerdicts(response);
        // A rejection verdict must survive this block — it is the only record
        // that a child's answer was dropped, so it outranks the happy 'idle'.
        this.status = hadRejections ? 'rejected' : 'idle';
        this.lastSyncAt = this.now().toISOString();
        this.nextAttemptAt = 0;
      } catch {
        // Transport failure: keep every item, record the attempt, back off. The
        // distinction from rejection is the entire reliability story — see the
        // header comment.
        this.status = 'error';
        this.lastProblem = 'The server could not be reached. Your work is saved and will sync later.';
        const backoff = Math.min(BASE_BACKOFF_MS * 2 ** Math.min(items[0]!.attempts, 5), MAX_BACKOFF_MS);
        this.nextAttemptAt = Date.now() + backoff;
        await this.recordAttempts(items);
      }

      return this.getSnapshot();
    } finally {
      this.flushing = false;
      this.notify();
    }
  }

  /** Applies accept/duplicate/reject verdicts; returns true if any were rejected. */
  private async applyVerdicts(response: SyncBatchResponse): Promise<boolean> {
    const config = await this.ensureLoaded();
    const rejections: string[] = [];

    for (const result of response.results) {
      if (result.status === 'rejected') {
        // A data problem will never succeed on retry. Drop it, but say so —
        // silently deleting a child's work is the one unforgivable failure.
        await this.storage.remove(result.clientId);
        rejections.push(result.message ?? 'rejected');
        continue;
      }
      // `accepted` and `duplicate` both mean the server has it durably.
      await this.storage.remove(result.clientId);
    }
    this.pendingCount = Math.max(0, this.pendingCount - response.results.length);

    const acknowledged = Math.max(config.cursor, response.acknowledgedCursor);
    if (acknowledged !== config.cursor) {
      config.cursor = acknowledged;
      await this.storage.setConfig(config);
    }

    if (rejections.length > 0) {
      this.lastProblem = `${rejections.length} saved ${rejections.length === 1 ? 'answer was' : 'answers were'} not accepted: ${rejections[0]}`;
      return true;
    }
    this.lastProblem = null;
    return false;
  }

  private async recordAttempts(items: readonly SyncQueueItem[]): Promise<void> {
    for (const item of items.slice(0, this.maxBatch)) {
      await this.storage.put({ ...item, attempts: item.attempts + 1, lastAttemptAt: this.now().toISOString() });
    }
  }
}

function generateClientId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `c-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
