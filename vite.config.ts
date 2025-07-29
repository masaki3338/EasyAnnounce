// vite.config.ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa'; // ← 追加

export default defineConfig({
  plugins: [
    react(),
    VitePWA({  // ← 追加：必要に応じてオプション追加
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'robots.txt', 'manual.pdf'],
      manifest: {
        name: 'Easy Announce',
        short_name: 'Announce',
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
    })
  ],
});
