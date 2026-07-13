import { db } from '../firebase';
import { collection, doc, writeBatch } from 'firebase/firestore';
import fallbackData from '../fallbackData.json';

// Local storage key helper
const getCacheKey = (storeId: string, collectionName: string) => `pos_cache_${storeId || 'Sandbox'}_${collectionName}`;
const getQueueKey = (storeId: string) => `pos_offline_queue_${storeId || 'Sandbox'}`;

export interface OfflineOperation {
  id: string;
  collection: string;
  operation: 'set' | 'delete';
  docId: string;
  data?: any;
  timestamp: string;
}

/**
 * Saves a data collection to local cache.
 * When online, this is called inside Firestore snapshot listeners to keep local cache updated.
 */
export function saveToCache(storeId: string, collectionName: string, data: any) {
  try {
    const key = getCacheKey(storeId, collectionName);
    localStorage.setItem(key, JSON.stringify(data));
  } catch (e) {
    console.error(`Failed to save ${collectionName} to cache:`, e);
  }
}

/**
 * Gets a collection's data from cache, or falls back to standard JSON data.
 */
export function getFromCache(storeId: string, collectionName: string): any {
  try {
    const key = getCacheKey(storeId, collectionName);
    const cached = localStorage.getItem(key);
    if (cached) {
      return JSON.parse(cached);
    }
  } catch (e) {
    // Suppress verbose console error on first load
  }

  // Fallback to imported JSON data if no local cache exists
  const defaults = fallbackData as any;
  return defaults[collectionName] !== undefined ? defaults[collectionName] : [];
}

/**
 * Adds an operation to the offline queue.
 * Also updates the local cache immediately so the user sees their changes in offline mode!
 */
export function queueOfflineOperation(
  storeId: string,
  collectionName: string,
  operation: 'set' | 'delete',
  docId: string,
  data?: any
) {
  try {
    const sId = storeId || 'Sandbox';
    const queueKey = getQueueKey(sId);
    const rawQueue = localStorage.getItem(queueKey);
    const queue: OfflineOperation[] = rawQueue ? JSON.parse(rawQueue) : [];

    const newOp: OfflineOperation = {
      id: `op-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
      collection: collectionName,
      operation,
      docId,
      data,
      timestamp: new Date().toISOString()
    };

    queue.push(newOp);
    localStorage.setItem(queueKey, JSON.stringify(queue));

    // Update local cache immediately so the offline user sees changes
    const currentCached = getFromCache(sId, collectionName);
    let updated = Array.isArray(currentCached) ? [...currentCached] : [];

    if (operation === 'set' && data) {
      const idx = updated.findIndex((item: any) => item.id === docId || item.uid === docId);
      if (idx > -1) {
        updated[idx] = { ...updated[idx], ...data };
      } else {
        updated.unshift({ id: docId, ...data });
      }
    } else if (operation === 'delete') {
      updated = updated.filter((item: any) => item.id !== docId && item.uid !== docId);
    }

    saveToCache(sId, collectionName, updated);
    console.log(`[OFFLINE MANAGER] Queued offline operation for ${collectionName}:`, newOp);
  } catch (e) {
    console.error('Failed to queue offline operation:', e);
  }
}

/**
 * Triggers sync of all pending offline operations to Firestore when we go online.
 */
export async function syncOfflineOperations(storeId: string): Promise<boolean> {
  const sId = storeId || 'Sandbox';
  if (sId === 'Sandbox') return false;

  const queueKey = getQueueKey(sId);
  const rawQueue = localStorage.getItem(queueKey);
  if (!rawQueue) return false;

  try {
    const queue: OfflineOperation[] = JSON.parse(rawQueue);
    if (queue.length === 0) return false;

    console.log(`[OFFLINE MANAGER - SYNC] Syncing ${queue.length} offline operations to Firestore...`);

    const batch = writeBatch(db);
    let count = 0;

    for (const op of queue) {
      const docRef = doc(db, 'stores', sId, op.collection, op.docId);
      if (op.operation === 'set') {
        batch.set(docRef, { ...op.data, storeId: sId }, { merge: true });
      } else if (op.operation === 'delete') {
        batch.delete(docRef);
      }
      count++;

      // Batch limit in Firestore is 500 writes
      if (count >= 400) {
        break;
      }
    }

    await batch.commit();

    // Remove synced operations from queue
    const remaining = queue.slice(count);
    if (remaining.length > 0) {
      localStorage.setItem(queueKey, JSON.stringify(remaining));
      // Recursively sync next batch
      await syncOfflineOperations(sId);
    } else {
      localStorage.removeItem(queueKey);
    }

    console.log(`[OFFLINE MANAGER - SYNC] Successfully synced ${count} offline operations to Firestore!`);
    return true;
  } catch (e) {
    console.error('[OFFLINE MANAGER - SYNC] Failed to sync offline operations to Firestore:', e);
    return false;
  }
}
