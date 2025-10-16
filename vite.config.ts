// vite.config.ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,webp,woff2,mp3,pdf}'],
        maximumFileSizeToCacheInBytes: 10 * 1024 * 1024,
        clientsClaim: true,
        skipWaiting: true,
        // ★ /api への「ページ遷移」を SPA 殻にフォールバックしない
        navigateFallbackDenylist: [/^\/api\//],
        // ★ /api は必ずネットへ（安全のため GET/POST を明示）
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.pathname.startsWith('/api/'),
            handler: 'NetworkOnly',
            method: 'GET',
          },
          {
            urlPattern: ({ url }) => url.pathname.startsWith('/api/'),
            handler: 'NetworkOnly',
            method: 'POST',
          },
        ],
      },
      includeAssets: [
        'favicon.svg', 'robots.txt', 'field.png', 'EasyAnnounceLOGO.png',
        'mic-red.png', 'Defence.png', 'Ofence.png', 'Runner.png',
        'warning-icon.png', 'manual.pdf'
      ],
      manifest: {
        name: 'Easyアナウンス PONY',
        short_name: 'Easyアナウンス',
        start_url: '/',
        display: 'standalone',
        background_color: '#ffffff',
        theme_color: '#d32f2f',
        icons: [
          { src: 'EasyAnnounce-Pony-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'EasyAnnounce-Pony-512x512.png', sizes: '512x512', type: 'image/png' }
        ]
      }
    })
  ],
  resolve: {
    dedupe: ['react', 'react-dom']
  },
  // ★ ローカル(5173) → vercel dev(3000) に中継。CORS回避の要。
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:3000', // ← vercel dev を起動しておく
        changeOrigin: true,
        secure: false, // http宛なので false でOK（httpsなら true でも可）
      },
    },
  },
  optimizeDeps: {
    include: ['@react-pdf-viewer/core/lib/styles/index.css']
  }
});
