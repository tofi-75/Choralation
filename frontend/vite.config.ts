/** Preserve the browser origin for Django session cookies and CSRF checks. */
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': {
        target: process.env.BACKEND_ORIGIN ?? 'http://127.0.0.1:8000',
        changeOrigin: false,
      },
      '/health': {
        target: process.env.BACKEND_ORIGIN ?? 'http://127.0.0.1:8000',
        changeOrigin: false,
      },
    },
  },
});
