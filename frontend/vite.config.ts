import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'
import path from 'node:path'

export default defineConfig({
  resolve: { alias: { '@': path.resolve(__dirname, 'src') } },
  // host:true so a phone on the LAN can reach it; allowedHosts lets an HTTPS
  // tunnel through, which getUserMedia requires on a real device
  server: { host: true, port: 5180, allowedHosts: true },
  preview: { host: true, port: 5180, allowedHosts: true },
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg'],
      manifest: {
        id: '/',
        name: 'AI คัดผลดี — แพลตฟอร์มคัดเกรดผลไม้อัจฉริยะ',
        short_name: 'AI คัดผลดี',
        description:
          'วัดขนาดและคัดเกรดผลไม้ด้วยมือถือ ใช้แผ่นสอบเทียบและ AI — AI Smart Fruit Grading Platform',
        lang: 'th',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#FAFAF9',
        theme_color: '#16A34A',
        categories: ['productivity', 'utilities'],
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          {
            src: 'icons/icon-512-maskable.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        // the mat PDF is the one file a farmer needs BEFORE they have signal,
        // so it is precached rather than fetched on demand
        globPatterns: ['**/*.{js,css,html,svg,png,woff2,pdf}'],
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
        navigateFallbackDenylist: [/^\/api\//],
      },
      devOptions: { enabled: false },
    }),
  ],
})
