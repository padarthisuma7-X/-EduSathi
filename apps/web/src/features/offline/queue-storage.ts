/**
 * Storage backends for the offline sync queue.
 *
 * The queue engine (`sync-queue.ts`) owns *policy* (ordering, retries, cursors);
 * this module owns *durability*. Splitting them means the engine is unit-tested
 * against the in-memory backend, while the browser gets IndexedDB — the only
 * storage here that survives the tablet being locked, the browser being killed
 * by the OS to free memory, or three days without power.
 *
 * The interface is promise-based even for the memory backend, so the engine
 * cannot accidentally rely on synchronous availability — on a cold start the
 * IndexedDB handle is not there yet, and code that assumed it was would drop a
 * learner's work in exactly the offline conditions this module exists for.
 */

import type { SyncEntityType, SyncQueueItem } from '@sahaj/shared/domain';

/** Per-device state that must survive restarts next to the items. */
export interface QueueConfig {
  deviceId: string;
  /** Highest contiguous sequence the server has acknowledged. */
  cursor: number;
  /** Last sequence handed out; the next enqueued item gets `sequence + 1`. */
  sequence: number;
}

export interface QueueStorage {
  getConfig(): Promise<QueueConfig | null>;
  setConfig(config: QueueConfig): Promise<void>;
  /** All pending items, in stable storage order (callers sort by sequence). */
  list(): Promise<SyncQueueItem[]>;
  put(item: SyncQueueItem): Promise<void>;
  remove(clientId: string): Promise<void>;
}

/** Exact, dependency-free backend for unit tests and server rendering. */
export function createMemoryQueueStorage(): QueueStorage {
  let config: QueueConfig | null = null;
  const items = new Map<string, SyncQueueItem>();

  return {
    async getConfig() {
      return config;
    },
    async setConfig(next) {
      config = next;
    },
    async list() {
      return [...items.values()];
    },
    async put(item) {
      items.set(item.clientId, item);
    },
    async remove(clientId) {
      items.delete(clientId);
    },
  };
}

const DB_NAME = 'sahaj-sync';
const DB_VERSION = 1;
const ITEM_STORE = 'items';
const META_STORE = 'meta';

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(ITEM_STORE)) {
        // `clientId` is the natural key: a replay of the same item must land on
        // the same record, never duplicate it.
        db.createObjectStore(ITEM_STORE, { keyPath: 'clientId' });
      }
      if (!db.objectStoreNames.contains(META_STORE)) {
        db.createObjectStore(META_STORE, { keyPath: 'key' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB open failed'));
  });
}

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed'));
  });
}

/** Resolves when the transaction has durably committed, rejects on any failure. */
function transactionDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onabort = () => reject(tx.error ?? new Error('IndexedDB transaction aborted'));
    tx.onerror = () => reject(tx.error ?? new Error('IndexedDB transaction failed'));
  });
}

/**
 * IndexedDB backend. Handles are opened per operation rather than cached: the
 * browser can invalidate a cached handle when it evicts the origin's storage
 * under pressure, and a fresh `open()` recovers where a stale handle would
 * silently stop committing.
 */
export function createIndexedDbQueueStorage(): QueueStorage {
  async function withStore<T>(run: (db: IDBDatabase) => Promise<T>): Promise<T> {
    const db = await openDatabase();
    try {
      return await run(db);
    } finally {
      db.close();
    }
  }

  return {
    async getConfig() {
      return withStore(async (db) => {
        const tx = db.transaction(META_STORE, 'readonly');
        const row = await requestToPromise(tx.objectStore(META_STORE).get('config') as IDBRequest<{ key: string; value: QueueConfig } | undefined>);
        return row?.value ?? null;
      });
    },
    async setConfig(config) {
      await withStore(async (db) => {
        const tx = db.transaction(META_STORE, 'readwrite');
        tx.objectStore(META_STORE).put({ key: 'config', value: config });
        await transactionDone(tx);
      });
    },
    async list() {
      return withStore(async (db) => {
        const tx = db.transaction(ITEM_STORE, 'readonly');
        return requestToPromise(tx.objectStore(ITEM_STORE).getAll() as IDBRequest<SyncQueueItem[]>);
      });
    },
    async put(item) {
      await withStore(async (db) => {
        const tx = db.transaction(ITEM_STORE, 'readwrite');
        tx.objectStore(ITEM_STORE).put(item);
        await transactionDone(tx);
      });
    },
    async remove(clientId) {
      await withStore(async (db) => {
        const tx = db.transaction(ITEM_STORE, 'readwrite');
        tx.objectStore(ITEM_STORE).delete(clientId);
        await transactionDone(tx);
      });
    },
  };
}

/** Whether the current environment has the IndexedDB this app needs. */
export function hasIndexedDb(): boolean {
  return typeof window !== 'undefined' && 'indexedDB' in window;
}

export type { SyncEntityType };
