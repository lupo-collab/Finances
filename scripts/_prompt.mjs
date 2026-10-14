// Hidden passphrase input (TTY) or LF_PASSPHRASE env var. Never written to disk.
import readline from 'node:readline';

export function askHidden(question) {
  return new Promise((resolve, reject) => {
    if (!process.stdin.isTTY) return reject(new Error('No TTY: set LF_PASSPHRASE instead'));
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    rl._writeToOutput = (s) => {
      if (s.includes(question)) rl.output.write(s);
    };
    rl.question(question, (a) => {
      rl.close();
      process.stdout.write('\n');
      resolve(a);
    });
  });
}

export async function getPassphrase({ confirm }) {
  const env = process.env.LF_PASSPHRASE;
  if (env) return env;
  const a = await askHidden('Passphrase: ');
  if (confirm) {
    const b = await askHidden('Repeat passphrase: ');
    if (a !== b) throw new Error('Passphrases do not match');
  }
  return a;
}
