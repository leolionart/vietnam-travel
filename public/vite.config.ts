import { defineConfig } from 'vite';

export default defineConfig({
    base: '/',
    build: {
        outDir: '../dist/public',
        emptyOutDir: true,
    },
    server: {
        port: 3000,
        host: true,
        proxy: {
            '/api': {
                target: 'http://localhost:7321',
                changeOrigin: true,
            },
            '/admin': {
                target: 'http://localhost:3002',
                changeOrigin: true,
                rewrite: (path) => path === '/admin' ? '/admin/' : path,
            },
        },
    },
});
