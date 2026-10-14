import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

const CSP =
  "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; " +
  "connect-src 'self'; object-src 'none'; base-uri 'none'; worker-src 'self'";

// The strict CSP is injected only into the production build (Vite dev needs an inline preamble).
function cspPlugin(): Plugin {
  return {
    name: 'inject-csp',
    apply: 'build',
    transformIndexHtml(html) {
      return html.replace('<!--CSP-->', `<meta http-equiv="Content-Security-Policy" content="${CSP}" />`);
    },
  };
}

export default defineConfig(({ mode, command }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  if (command === 'build' && (env.VITE_DEV_PASSPHRASE || process.env.VITE_DEV_PASSPHRASE)) {
    throw new Error('VITE_DEV_PASSPHRASE must not be defined for a production build.');
  }
  return {
    base: './',
    plugins: [react(), cspPlugin()],
    build: { sourcemap: false, chunkSizeWarningLimit: 1500 },
    test: { environment: 'node', include: ['tests/**/*.test.ts'] },
  };
});
