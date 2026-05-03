import { defineConfig } from 'vite';
import { readdirSync, existsSync } from 'fs';
import { resolve } from 'path';

// Collect all root-level HTML files as entry points
const rootHtml = readdirSync('.').filter(f => f.endsWith('.html'));
const input = {};
for (const file of rootHtml) {
  const name = file.replace('.html', '');
  input[name] = resolve(__dirname, file);
}

export default defineConfig({
  // env prefix — Vite exposes VITE_* vars to client code via import.meta.env
  envPrefix: 'VITE_',

  server: {
    open: '/index.html',
  },

  build: {
    // lightningcss (Vite default) chokes on a malformed inline <style> block
    // somewhere in the demo HTML files; esbuild's CSS minifier is more lenient.
    cssMinify: 'esbuild',
    rollupOptions: {
      input,
    },
  },

  test: {
    include: ['test/unit/**/*.test.js', 'test/smoke_v21_*.test.js'],
    exclude: ['test/unit/byeori_v2_scoring.test.js', 'test/unit/byeori_v3_scoring.test.js'],
    environment: 'node',
  },
});
