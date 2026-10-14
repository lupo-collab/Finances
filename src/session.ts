// Unlock / remember-device logic. Decrypted data lives only in React state; locking drops it.
import { assertEnvelope, decryptWithKey, deriveKey, fromB64, type Envelope } from './lib/crypto';
import { parseFinance, type Finance } from './data/schema';

const DB = 'lf-device';
const STORE = 'keys';
const KEY_ID = 'k1';

export async function fetchEnvelope(): Promise<Envelope> {
  const r = await fetch('data.enc.json', { cache: 'no-store' });
  if (!r.ok) throw new Error(r.status === 404 ? 'No encrypted data published yet (data.enc.json missing).' : `Could not load data (${r.status}).`);
  const e = await r.json();
  assertEnvelope(e);
  return e;
}

export async function unlock(env: Envelope, passphrase: string, remember: boolean): Promise<Finance> {
  const key = await deriveKey(passphrase, fromB64(env.salt), env.iter);
  const data = parseFinance(await decryptWithKey(env, key));
  if (remember) await storeKey({ key, salt: env.salt, iter: env.iter });
  return data;
}

interface Stored {
  key: CryptoKey;
  salt: string;
  iter: number;
}

function db(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE);
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}

async function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const d = await db();
  return new Promise((res, rej) => {
    const t = d.transaction(STORE, mode);
    const q = fn(t.objectStore(STORE));
    // resolve only once the transaction has committed (a reload could otherwise abort it)
    t.oncomplete = () => {
      d.close();
      res(q.result);
    };
    t.onerror = t.onabort = () => {
      d.close();
      rej(t.error ?? q.error);
    };
  });
}

async function storeKey(s: Stored) {
  await tx('readwrite', (st) => st.put(s, KEY_ID));
}

export async function rememberedKey(): Promise<Stored | null> {
  try {
    return ((await tx('readonly', (st) => st.get(KEY_ID))) as Stored | undefined) ?? null;
  } catch {
    return null;
  }
}

export async function forgetDevice() {
  try {
    await tx('readwrite', (st) => st.delete(KEY_ID));
  } catch {
    /* nothing stored */
  }
}

/** Unlock with the remembered non-extractable key; returns null (and forgets) if it no longer fits. */
export async function unlockRemembered(env: Envelope): Promise<Finance | null> {
  const s = await rememberedKey();
  if (!s) return null;
  if (s.salt !== env.salt || s.iter !== env.iter) {
    await forgetDevice(); // data was re-encrypted with a new salt
    return null;
  }
  try {
    return parseFinance(await decryptWithKey(env, s.key));
  } catch {
    await forgetDevice();
    return null;
  }
}

export const IDLE_LOCK_MS = 15 * 60 * 1000;
