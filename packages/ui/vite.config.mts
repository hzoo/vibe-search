import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';
import tailwindcss from '@tailwindcss/vite';
import { resolve } from 'node:path';

export default defineConfig({
  plugins: [preact(), tailwindcss()],
  resolve: {
    alias: [
      { find: '@', replacement: resolve(__dirname, '..') }
    ]
  },
  server: {
    allowedHosts: ['localhost', '127.0.0.1', 'vibe-search.henryzoo.com']
  }
}); 
