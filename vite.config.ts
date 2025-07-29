import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'robots.txt', 'manual.pdf'],
      manifest: {
        name: 'Easy アナウンス PONY',
        short_name: 'Easy Announce',
        start_url: '/',
        display: 'standalone',
        background_color: '#ffffff',
        theme_color: '#0078d7',
        icons: [
          {
            src: 'EasyAnnounce-Pony-192x192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: 'EasyAnnounce-Pony-512x512.png',
            sizes: '512x512',
            type: 'image/png',
          },
        ],
      },
    }),
  ],

  // ✅ ここを追記
  optimizeDeps: {
    include: [
      '@react-pdf-viewer/core/lib/styles/index.css',
      '@react-pdf-viewer/default-layout/lib/styles/index.css',
    ],
  },
});
