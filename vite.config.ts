// vite.config.ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: [
        'favicon.svg',
        'robots.txt',
        'manual.pdf',
        'pdf.worker.min.js',
        'field.jpg' 
      ],
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

  // ✅ Vercel対策：ビルドエラーを防ぐためCSSを外部扱いに
  build: {
    rollupOptions: {
      external: [
        '@react-pdf-viewer/core/lib/styles/index.css',
        '@react-pdf-viewer/default-layout/lib/styles/index.css',
      ],
    },
  },

  // ✅ Viteの依存関係プリバンドル対象に含める
  optimizeDeps: {
    include: [
      '@react-pdf-viewer/core',
      '@react-pdf-viewer/default-layout',
    ],
  },
});
