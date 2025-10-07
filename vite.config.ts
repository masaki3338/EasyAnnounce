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
        maximumFileSizeToCacheInBytes: 10 * 1024 * 1024, // 10MBまでPDFも確実に
        clientsClaim: true,
        skipWaiting: true,
        // ★ /api/ への「ページ遷移」を SPA 殻にフォールバックしない
        navigateFallbackDenylist: [/^\/api\//],
        // ★ /api/ リクエストは必ずネットへ（キャッシュしない）
        runtimeCaching: [
          {
            urlPattern: ({url}) => url.pathname.startsWith('/api/'),
            handler: 'NetworkOnly',
            method: 'GET',
          },
        ],
      },
      includeAssets: ['favicon.svg', 'robots.txt', 'field.png','EasyAnnounceLOGO.png', 'mic-red.png','Defence.png','Ofence.png','Runner.png','warning-icon.png','manual.pdf'],
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
  // ▼ ここを追加：/api を vercel dev(3000)へ中継
  server: {
    proxy: {
      '/api': {
        target: 'https://easy-announce.vercel.app', // ← あなたの Vercel ドメイン
        changeOrigin: true,
        secure: true,
      },
    },
  },

  optimizeDeps: {
    include: ['@react-pdf-viewer/core/lib/styles/index.css']
  }
});
