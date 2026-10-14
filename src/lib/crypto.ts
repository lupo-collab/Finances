// AES-256-GCM with a PBKDF2-HMAC-SHA256 key. Shared by the browser and the Node scripts
// (both expose WebCrypto, CompressionStream and atob/btoa).

export const DEFAULT_ITERATIONS = 600_000; // OWASP guidance for PBKDF2-HMAC-SHA256
export const KDF = 'PBKDF2-HMAC-SHA256';

export interface Envelope {
  v: 1;
  kdf: typeof KDF;
  iter: number;
  salt: string; // base64, 16 bytes
  iv: string; // base64, 12 bytes
  ct: string; // base64 AES-GCM ciphertext of gzip(JSON)
}

const subtle = () => globalThis.crypto.subtle;

export function toB64(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

export function fromB64(b64: string): Uint8Array<ArrayBuffer> {
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

async function pipe(data: Uint8Array<ArrayBuffer>, t: CompressionStream | DecompressionStream): Promise<Uint8Array<ArrayBuffer>> {
  const stream = new Blob([data]).stream().pipeThrough(t as unknown as ReadableWritablePair<Uint8Array, Uint8Array>);
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

export const gzip = (b: Uint8Array<ArrayBuffer>) => pipe(b, new CompressionStream('gzip'));
export const gunzip = (b: Uint8Array<ArrayBuffer>) => pipe(b, new DecompressionStream('gzip'));

export async function deriveKey(
  passphrase: string,
  salt: Uint8Array<ArrayBuffer>,
  iterations: number,
  usages: KeyUsage[] = ['decrypt'],
): Promise<CryptoKey> {
  const base = await subtle().importKey('raw', new TextEncoder().encode(passphrase.normalize('NFC')), 'PBKDF2', false, ['deriveKey']);
  return subtle().deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations },
    base,
    { name: 'AES-GCM', length: 256 },
    false, // non-extractable
    usages,
  );
}

export async function encryptJSON(value: unknown, passphrase: string, iterations = DEFAULT_ITERATIONS): Promise<Envelope> {
  if (iterations < DEFAULT_ITERATIONS) throw new Error(`iterations must be >= ${DEFAULT_ITERATIONS}`);
  const salt = globalThis.crypto.getRandomValues(new Uint8Array(16));
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(passphrase, salt, iterations, ['encrypt']);
  const plain = await gzip(new TextEncoder().encode(JSON.stringify(value)));
  const ct = new Uint8Array(await subtle().encrypt({ name: 'AES-GCM', iv }, key, plain));
  return { v: 1, kdf: KDF, iter: iterations, salt: toB64(salt), iv: toB64(iv), ct: toB64(ct) };
}

export class WrongPassphraseError extends Error {
  constructor() {
    super('Wrong passphrase (or the data file was modified).');
    this.name = 'WrongPassphraseError';
  }
}

export function assertEnvelope(e: unknown): asserts e is Envelope {
  const x = e as Partial<Envelope>;
  if (!x || x.v !== 1 || x.kdf !== KDF || typeof x.iter !== 'number' || !x.salt || !x.iv || !x.ct)
    throw new Error('Not a valid encrypted data envelope');
}

export async function decryptWithKey(env: Envelope, key: CryptoKey): Promise<unknown> {
  let plain: ArrayBuffer;
  try {
    plain = await subtle().decrypt({ name: 'AES-GCM', iv: fromB64(env.iv) }, key, fromB64(env.ct));
  } catch {
    throw new WrongPassphraseError();
  }
  const json = new TextDecoder().decode(await gunzip(new Uint8Array(plain)));
  return JSON.parse(json);
}

export async function decryptJSON(env: Envelope, passphrase: string): Promise<unknown> {
  assertEnvelope(env);
  const key = await deriveKey(passphrase, fromB64(env.salt), env.iter);
  return decryptWithKey(env, key);
}
