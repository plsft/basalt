import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

// Read-only Brief reader. Installs as a PWA on iOS Safari and Android
// Chrome. Service worker caches the app shell so the brief view loads
// instantly on second open even offline; the brief content itself is
// fetched live and cached opaquely.

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["favicon.svg", "apple-touch-icon.png"],
      manifest: {
        name: "Basalt",
        short_name: "Basalt",
        description: "Read your Basalt briefs from anywhere.",
        theme_color: "#0E0D0C",
        background_color: "#0E0D0C",
        display: "standalone",
        orientation: "portrait",
        start_url: "/",
        icons: [
          { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
          {
            src: "/icon-512-maskable.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
      workbox: {
        navigateFallback: "/index.html",
        runtimeCaching: [
          {
            // Cache brief reads for offline. Stale-while-revalidate so the
            // user sees the cached copy instantly + a fresh fetch in the
            // background.
            urlPattern: /\/v1\/briefs(\/[^/]+)?$/,
            handler: "StaleWhileRevalidate",
            options: {
              cacheName: "basalt-briefs",
              expiration: { maxEntries: 100, maxAgeSeconds: 30 * 24 * 60 * 60 },
            },
          },
          {
            // Brief listing / metadata.
            urlPattern: /\/v1\/(me|vaults)$/,
            handler: "NetworkFirst",
            options: {
              cacheName: "basalt-meta",
              networkTimeoutSeconds: 4,
            },
          },
        ],
      },
      devOptions: {
        enabled: false,
      },
    }),
  ],
  server: {
    port: 5174,
    proxy: {
      "/v1": "http://localhost:8787",
      "/health": "http://localhost:8787",
    },
  },
  build: {
    target: "es2022",
  },
});
