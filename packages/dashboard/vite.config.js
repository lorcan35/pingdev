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
                router: function (req) {
                    var _a;
                    var url = (_a = req.url) !== null && _a !== void 0 ? _a : '';
                    var m = url.match(/^\/api\/(\d+)/);
                    return m ? "http://localhost:".concat(m[1]) : 'http://localhost:3456';
                },
                rewrite: function (path) { return path.replace(/^\/api\/\d+/, ''); },
            },
            '/gw': {
                target: 'http://localhost:3500',
                changeOrigin: true,
                rewrite: function (path) { return path.replace(/^\/gw/, ''); },
            },
        },
    },
    build: {
        outDir: 'dist',
    },
});
