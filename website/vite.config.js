import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The deployed site's nginx forwards /v1 to The Ring, and so does the dev server below, so the browser only
// ever talks to its own origin and CORS never comes into it. Set RING_URL to point at a Ring you run locally,
// for example RING_URL=http://127.0.0.1:3100 with ANALYSIS_PROVIDER=mock to try the site without spending quota.
const ring = process.env.RING_URL || 'https://dhamantaha.arc-homlab.com';
const proxy = { '/v1': { target: ring, changeOrigin: true } };

export default defineConfig({
  plugins: [react()],
  build: { outDir: 'dist', target: 'es2020' },
  server: { proxy },
  preview: { proxy },
});
