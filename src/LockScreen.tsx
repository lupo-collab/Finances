import { useEffect, useState, type FormEvent } from 'react';
import type { Finance } from './data/schema';
import type { Envelope } from './lib/crypto';
import { WrongPassphraseError } from './lib/crypto';
import { fetchEnvelope, forgetDevice, rememberedKey, unlock, unlockRemembered } from './session';

export function LockScreen({ onUnlock }: { onUnlock: (d: Finance) => void }) {
  const [env, setEnv] = useState<Envelope | null>(null);
  const [pass, setPass] = useState('');
  const [remember, setRemember] = useState(false);
  const [hasRemembered, setHasRemembered] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    fetchEnvelope()
      .then(async (e) => {
        setEnv(e);
        setHasRemembered(!!(await rememberedKey()));
        const dev = import.meta.env.DEV ? import.meta.env.VITE_DEV_PASSPHRASE : undefined;
        if (dev) onUnlock(await unlock(e, dev, false));
      })
      .catch((e: Error) => setErr(e.message));
  }, [onUnlock]);

  async function submit(ev: FormEvent) {
    ev.preventDefault();
    if (!env || !pass) return;
    setBusy(true);
    setErr(null);
    try {
      const d = await unlock(env, pass, remember);
      setPass('');
      onUnlock(d);
    } catch (e) {
      setErr(e instanceof WrongPassphraseError ? 'That passphrase did not unlock the data. Check it and try again.' : `Could not open the data: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  async function useDevice() {
    if (!env) return;
    setBusy(true);
    const d = await unlockRemembered(env);
    setBusy(false);
    if (d) onUnlock(d);
    else {
      setHasRemembered(false);
      setErr('This device no longer has a valid key (the data was re-encrypted). Enter the passphrase.');
    }
  }

  return (
    <main className="lock">
      <form className="lock-card" onSubmit={submit}>
        <div className="lock-icon" aria-hidden>
          ◆
        </div>
        <h1>Private dashboard</h1>
        <p className="muted">Enter your passphrase to decrypt the data in this browser.</p>
        {hasRemembered && (
          <>
            <button type="button" className="btn primary wide" onClick={useDevice} disabled={busy || !env}>
              Unlock with this device
            </button>
            <button
              type="button"
              className="btn link"
              onClick={async () => {
                await forgetDevice();
                setHasRemembered(false);
              }}
            >
              Forget this device
            </button>
            <div className="or">or</div>
          </>
        )}
        <label className="sr-only" htmlFor="pass">
          Passphrase
        </label>
        <input
          id="pass"
          type="password"
          autoComplete="current-password"
          autoFocus
          placeholder="Passphrase"
          value={pass}
          onChange={(e) => setPass(e.target.value)}
          disabled={busy}
        />
        <label className="toggle small">
          <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
          <span>Remember on this device</span>
        </label>
        {remember && (
          <p className="hint">
            Stores a non-extractable key in this browser: anyone using this browser profile can unlock without the passphrase.
          </p>
        )}
        <button className="btn primary wide" type="submit" disabled={busy || !env || !pass}>
          {busy ? 'Decrypting…' : 'Unlock'}
        </button>
        {err && (
          <p className="error" role="alert">
            {err}
          </p>
        )}
        <p className="hint">
          The encrypted file is public; its safety rests entirely on the strength of your passphrase. Auto-locks after 15 minutes idle.
        </p>
      </form>
    </main>
  );
}
