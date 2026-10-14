import { describe, it, expect } from 'vitest';
import { encryptJSON, decryptJSON, WrongPassphraseError, DEFAULT_ITERATIONS, fromB64 } from '../src/lib/crypto';

describe('crypto envelope', () => {
  const payload = { hello: 'world', n: [1, 2, 3], nested: { x: 1.5 } };
  it('round-trips with the right passphrase', async () => {
    const env = await encryptJSON(payload, 'correct horse battery staple');
    expect(env.iter).toBeGreaterThanOrEqual(DEFAULT_ITERATIONS);
    expect(fromB64(env.salt)).toHaveLength(16);
    expect(fromB64(env.iv)).toHaveLength(12);
    expect(JSON.stringify(env)).not.toContain('world');
    expect(await decryptJSON(env, 'correct horse battery staple')).toEqual(payload);
  }, 30000);
  it('fails cleanly with a wrong passphrase', async () => {
    const env = await encryptJSON(payload, 'right');
    await expect(decryptJSON(env, 'wrong')).rejects.toBeInstanceOf(WrongPassphraseError);
  }, 30000);
  it('uses a fresh salt and IV every run', async () => {
    const a = await encryptJSON(payload, 'p');
    const b = await encryptJSON(payload, 'p');
    expect(a.salt).not.toBe(b.salt);
    expect(a.iv).not.toBe(b.iv);
  }, 30000);
  it('refuses weak iteration counts', async () => {
    await expect(encryptJSON(payload, 'p', 1000)).rejects.toThrow();
  });
});
