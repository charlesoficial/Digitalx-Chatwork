import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";
const csp = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https://*.googleusercontent.com https://mlsnyxzirlzpgkpdfmma.supabase.co; connect-src 'self' https://mlsnyxzirlzpgkpdfmma.supabase.co wss://mlsnyxzirlzpgkpdfmma.supabase.co; media-src 'self' blob: https://mlsnyxzirlzpgkpdfmma.supabase.co; worker-src 'self' blob:; object-src 'none'; base-uri 'self'; form-action 'self'";
const securityHeaders = { "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer", "X-Frame-Options": "DENY", "Permissions-Policy": "microphone=(self), camera=(), display-capture=()" };
export default defineConfig({
  plugins: [
    {
      name: "digitalx-production-csp",
      apply: "build",
      transformIndexHtml: () => [{ tag: "meta", attrs: { "http-equiv": "Content-Security-Policy", content: csp }, injectTo: "head-prepend" }],
    },
    react(),
    tailwindcss(),
    VitePWA({
      registerType: "prompt",
      includeAssets: ["apple-touch-icon.png", "brand.svg", "brush.svg"],
      manifest: {
        name: "DIGITALX",
        short_name: "DIGITALX",
        description: "Juntos somos mais fortes",
        lang: "pt-BR",
        start_url: "/",
        scope: "/",
        display: "standalone",
        background_color: "#080a0b",
        theme_color: "#080a0b",
        icons: [
          { src: "/pwa-192.png", sizes: "192x192", type: "image/png" },
          { src: "/pwa-512.png", sizes: "512x512", type: "image/png" },
          {
            src: "/pwa-maskable.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,png,svg,woff2}"],
        navigateFallbackDenylist: [/^\/auth\//],
        runtimeCaching: [],
      },
    }),
  ],
  server: {
    headers: securityHeaders,
    port: 5173,
    strictPort: true,
    watch: {
      ignored: [
        "**/playwright-report/**",
        "**/test-results/**",
        "**/evidence/**",
      ],
    },
  },
  preview: { headers: { ...securityHeaders, "Content-Security-Policy": `${csp}; frame-ancestors 'none'` } },
});
