import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate', // 自動更新
      includeAssets: ['favicon.svg', 'robots.txt'], // 任意
      manifest: {
        name: 'Easyアナウンス PONY',
        short_name: 'Easyアナウンス',
        start_url: '/',
        display: 'standalone',
        background_color: '#ffffff',
        theme_color: '#d32f2f',
        icons: [
          {
            src: 'EasyAnnounce-Pony-192x192.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: 'EasyAnnounce-Pony-512x512.png',
            sizes: '512x512',
            type: 'image/png'
          }
        ]
      }
    })
  ]
});
