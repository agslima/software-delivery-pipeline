import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:8080',
        changeOrigin: true,
        secure: false,
      },
    },
  },
  test: {
    globals: true,             // Enables describe, it, expect without imports
    environment: 'jsdom',      // Simulates browser (window, document)
    setupFiles: './src/setupTests.js', // Global test setup
    css: false,                // Disable CSS parsing (speeds up tests)
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true
  }
});
