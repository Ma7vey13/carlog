// Persistent storage (SPEC section 2): ask the browser not to evict our IndexedDB
// under storage pressure, and report how much space is used.

export interface StorageInfo {
  supported: boolean;
  persisted: boolean;
  usage: number | null;
  quota: number | null;
}

const ASKED_KEY = 'carlog.persistAsked';

/** On first launch, asks for persistent storage once. Chrome decides silently (no dialog). */
export async function requestPersistenceOnFirstRun(): Promise<void> {
  if (!navigator.storage?.persist) return;
  try {
    if (localStorage.getItem(ASKED_KEY)) return;
    localStorage.setItem(ASKED_KEY, new Date().toISOString());
  } catch {
    // Without storage we can't remember asking; asking again is harmless.
  }
  try {
    if (!(await navigator.storage.persisted())) await navigator.storage.persist();
  } catch {
    // Some browsers reject in private mode; the app still works.
  }
}

export async function requestPersistence(): Promise<boolean> {
  try {
    return (await navigator.storage?.persist?.()) ?? false;
  } catch {
    return false;
  }
}

export async function getStorageInfo(): Promise<StorageInfo> {
  const storage = navigator.storage;
  if (!storage?.estimate) return { supported: false, persisted: false, usage: null, quota: null };
  const [estimate, persisted] = await Promise.all([
    storage.estimate().catch(() => ({}) as StorageEstimate),
    storage.persisted?.().catch(() => false) ?? Promise.resolve(false),
  ]);
  return {
    supported: true,
    persisted,
    usage: estimate.usage ?? null,
    quota: estimate.quota ?? null,
  };
}
