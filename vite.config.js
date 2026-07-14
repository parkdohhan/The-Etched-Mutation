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
    // 2026-07-14 R4-3: 폐기된 V2/V3 스코어링 화석 삭제 → exclude 불필요.
    // 현행 V4 스코어링 테스트는 test/unit/byeori_v4_scoring.test.js 로 편입됨.
    include: ['test/unit/**/*.test.js', 'test/smoke_*.test.js'],
    environment: 'node',
  },
});
