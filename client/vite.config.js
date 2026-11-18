import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    host: true, // 0.0.0.0 — reachable from the preview proxy
    port: 5173,
    allowedHosts: true, // the preview host is dynamic (*.e2b.app)
    proxy: {
      '/api': {
        target: process.env.API_ORIGIN || 'http://localhost:4000',
        changeOrigin: true,
      },
    },
  },
  build: { target: 'es2022' },
  resolve: { dedupe: ['react', 'react-dom'] },
});
