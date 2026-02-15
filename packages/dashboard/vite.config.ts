import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [tailwindcss(), react()],
  server: {
    port: 3400,
    proxy: {
      '^/api/\\d+': {
        target: 'http://localhost:3456',
        changeOrigin: true,
        router: (req) => {
          const url = req.url ?? '';
          const m = url.match(/^\/api\/(\d+)/);
          return m ? `http://localhost:${m[1]}` : 'http://localhost:3456';
        },
        rewrite: (path) => path.replace(/^\/api\/\d+/, ''),
      },
    },
  },
  build: {
    outDir: 'dist',
  },
});
