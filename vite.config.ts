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

  // ✅ 修正ポイント：モジュール名に変更
  optimizeDeps: {
    include: [
      '@react-pdf-viewer/core',
      '@react-pdf-viewer/default-layout',
    ],
  },

  // ✅ さらにこれを追加するとRollupエラーも防げます
  build: {
    rollupOptions: {
      external: [
        '@react-pdf-viewer/core',
        '@react-pdf-viewer/default-layout',
      ],
    },
  },
});
