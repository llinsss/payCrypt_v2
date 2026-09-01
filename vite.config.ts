import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],

  optimizeDeps: {
    exclude: ['lucide-react'],
  },

  build: {
    // Raise the warning threshold slightly to account for chart vendor chunk.
    // Hard budget is enforced in CI via scripts/check-bundle-size.js.
    chunkSizeWarningLimit: 250,

    rollupOptions: {
      output: {
        /**
         * Manual chunk strategy (issue #523):
         *
         * - vendor-react   : React runtime (stable, very long-lived cache)
         * - vendor-router  : react-router-dom (stable)
         * - vendor-charts  : recharts (large, only used on chart pages)
         * - vendor-qr      : qrcode / react-qr-code (used on QR page only)
         * - vendor-forms   : react-hook-form + resolvers + yup (auth / KYC)
         * - vendor-stellar : @stellar/stellar-sdk (Stellar pages only)
         * - vendor-utils   : date/format helpers (dayjs, luxon)
         * - index          : app shell + routing (minimal)
         * - Route-level JS chunks are emitted automatically by React.lazy()
         */
        manualChunks(id) {
          // React core runtime
          if (
            id.includes('node_modules/react/') ||
            id.includes('node_modules/react-dom/') ||
            id.includes('node_modules/scheduler/')
          ) {
            return 'vendor-react';
          }

          // Router
          if (
            id.includes('node_modules/react-router') ||
            id.includes('node_modules/@remix-run/')
          ) {
            return 'vendor-router';
          }

          // Charts — only loaded when a chart page is visited
          if (id.includes('node_modules/recharts')) {
            return 'vendor-charts';
          }

          // QR code libraries — only on QR page
          if (
            id.includes('node_modules/qrcode') ||
            id.includes('node_modules/react-qr-code')
          ) {
            return 'vendor-qr';
          }

          // Form libraries — auth / KYC pages
          if (
            id.includes('node_modules/react-hook-form') ||
            id.includes('node_modules/@hookform/') ||
            id.includes('node_modules/yup')
          ) {
            return 'vendor-forms';
          }

          // Stellar SDK — payment / balance pages
          if (id.includes('node_modules/@stellar/')) {
            return 'vendor-stellar';
          }

          // Date/format utilities
          if (
            id.includes('node_modules/dayjs') ||
            id.includes('node_modules/luxon')
          ) {
            return 'vendor-utils';
          }

          // Toast notifications — always present in the app shell
          if (id.includes('node_modules/react-hot-toast')) {
            return 'vendor-ui';
          }
        },
      },
    },
  },
});
