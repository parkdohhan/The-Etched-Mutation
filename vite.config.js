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
    rollupOptions: {
      input,
    },
  },
});
