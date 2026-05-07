import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

// Codes that mean "the browser closed the connection" — not real errors.
const EXPECTED_WS_CODES = new Set(['ECONNABORTED', 'ECONNRESET', 'EPIPE', 'ENOTCONN']);

function suppressExpectedWsErrors(proxy: import('http-proxy').Server, label: string) {
  proxy.on('error', (err: NodeJS.ErrnoException, _req, _res) => {
    if (EXPECTED_WS_CODES.has(err.code ?? '')) {
      // Browser closed the socket (page reload / tab close / HMR reconnect).
      // This is completely normal in dev — swallow it silently.
      return;
    }
    // Anything else is a real problem worth logging.
    console.error(`[${label} proxy error]`, err.message);
  });
}

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
    // Suppress the "ws proxy socket error: write ECONNABORTED" spam that appears
    // whenever the browser closes a WebSocket during a hot reload or tab navigation.
    // These are expected disconnects, not real errors.
    hmr: {
      // Keep HMR on the same port — no separate WS port needed.
      // The overlay still shows real build errors; we're only silencing transport noise.
      overlay: true,
    },
    proxy: {
      '/api': {
        target: 'http://localhost:5000',
        changeOrigin: true,
        configure: (proxy) => suppressExpectedWsErrors(proxy, 'api'),
      },
      '/socket.io': {
        target: 'http://localhost:5000',
        ws: true,
        changeOrigin: true,
        configure: (proxy) => suppressExpectedWsErrors(proxy, 'socket.io'),
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom', 'react-router-dom'],
          query: ['@tanstack/react-query'],
          ui: ['@radix-ui/react-dialog', '@radix-ui/react-dropdown-menu', 'lucide-react'],
          charts: ['recharts'],
          three: ['three', '@react-three/fiber', '@react-three/drei'],
          gsap: ['gsap'],
        },
      },
    },
  },
});
