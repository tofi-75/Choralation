/** Preserve the browser origin for Django session cookies and CSRF checks. */
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';
import type { Plugin, ViteDevServer } from 'vite';

// Both development and built previews use the same relative API URLs on phones.
const proxy = {
  ...Object.fromEntries(
    ['/about', '/privacy', '/terms', '/static'].map((path) => [
      path,
      { target: process.env.BACKEND_ORIGIN ?? 'http://127.0.0.1:8000', changeOrigin: false },
    ]),
  ),
  '/api': {
    target: process.env.BACKEND_ORIGIN ?? 'http://127.0.0.1:8000',
    changeOrigin: false,
  },
  '/health': {
    target: process.env.BACKEND_ORIGIN ?? 'http://127.0.0.1:8000',
    changeOrigin: false,
  },
};

/** Opt-in local diagnostics: omit query strings, headers, cookies and bodies. */
function phoneRequestLog(): Plugin {
  // Instrument dev and preview alike, since phone tests can use either launcher.
  const attach = (server: Pick<ViteDevServer, 'httpServer' | 'middlewares'>) => {
    if (process.env.PHONE_TEST_SESSION !== 'true') return;
    server.httpServer?.on('connection', (socket) => {
      console.info('[phone-connect]', JSON.stringify({ remote: socket.remoteAddress }));
    });
    server.middlewares.use((request, response, next) => {
      const started = Date.now();
      const path = (request.url ?? '/').split('?')[0];
      console.info(
        '[phone-request-start]',
        JSON.stringify({ method: request.method, path, remote: request.socket.remoteAddress }),
      );
      response.once('finish', () => {
        console.info(
          '[phone-request]',
          JSON.stringify({
            method: request.method,
            path,
            status: response.statusCode,
            remote: request.socket.remoteAddress,
            ms: Date.now() - started,
          }),
        );
      });
      next();
    });
  };
  return {
    name: 'phone-request-log',
    configureServer: attach,
    configurePreviewServer: attach,
  };
}
export default defineConfig({
  plugins: [react(), tailwindcss(), phoneRequestLog()],
  server: { port: 5173, strictPort: true, proxy },
  // Phone preview has explicit port/proxy settings. The launcher supplies LAN host.
  preview: { port: 5173, strictPort: true, proxy },
});
