import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import basicSsl from '@vitejs/plugin-basic-ssl';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  return {
    server: {
      port: 3100,
      host: 'localhost',
      // HTTPS is handled by basicSsl plugin for WebContainer API
      watch: {
        // Ignore projects folder - file changes there shouldn't trigger HMR
        ignored: ['**/projects/**', '**/node_modules/**', '**/.git/**'],
      },
      headers: {
        // Required for WebContainer API (SharedArrayBuffer support)
        // Using 'credentialless' instead of 'require-corp' for better compatibility
        'Cross-Origin-Embedder-Policy': 'credentialless',
        'Cross-Origin-Opener-Policy': 'same-origin',
      },
      proxy: {
        // Proxy API requests to HTTPS backend
        '/api': {
          target: 'https://localhost:3101',
          changeOrigin: true,
          secure: false, // Allow self-signed certificates
        },
      },
    },
    plugins: [
      react(),
      tailwindcss(),
      basicSsl(), // Self-signed cert for local HTTPS
    ],
    // SEC-004 fix: API keys are NOT exposed in frontend bundle
    // Users must configure their API keys through Settings UI, which stores them
    // securely (encrypted) in localStorage and backend. For development, set
    // GEMINI_API_KEY in .env and the backend will automatically configure the default provider.
    define: {},
    esbuild: {
      // Strip console.log/debug in production; keep warn/error for diagnostics
      pure: mode === 'production' ? ['console.log', 'console.debug'] : [],
      drop: mode === 'production' ? ['debugger'] : [],
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      }
    },
    optimizeDeps: {
      exclude: [
        'fs',
        'path',
        'os'
      ],
      include: [
        'react',
        'react-dom',
        'lucide-react',
        'dompurify',
        'diff',
        'uuid'
      ]
    },
    build: {
      sourcemap: false,
      rollupOptions: {
        external: [
          'fs',
          'path',
          'os'
        ],
        output: {
          manualChunks(id) {
            if (!id.includes('node_modules')) return;
            // React core
            if (id.includes('/react-dom/') || id.includes('/react/')) return 'vendor-react-core';
            // Icons
            if (id.includes('/lucide-react/')) return 'vendor-react-ui';
            // Code editor
            if (id.includes('/@monaco-editor/') || id.includes('/monaco-editor/')) return 'vendor-monaco';
            // AI SDKs
            if (id.includes('/@google/genai/') || id.includes('/openai/')) return 'vendor-ai';
            // Flow diagrams (includes d3 subdependencies)
            if (id.includes('/@xyflow/') || id.includes('/d3-')) return 'vendor-flow';
            // Utility libraries
            if (
              id.includes('/diff/') ||
              id.includes('/dompurify/') ||
              id.includes('/jszip/') ||
              id.includes('/file-saver/') ||
              id.includes('/uuid/') ||
              id.includes('/marked/')
            ) return 'vendor-utils';
          }
        }
      }
    }
  };
});
