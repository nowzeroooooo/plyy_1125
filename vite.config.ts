import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";

const repository = process.env.GITHUB_REPOSITORY?.split("/")[1];
const base = process.env.GITHUB_ACTIONS === "true"
  ? repository?.endsWith(".github.io") ? "/" : `/${repository ?? ""}/`
  : "/";

export default defineConfig({
  base,
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: "prompt",
      includeAssets: ["icons/wedding-rings.svg", "icons/wedding-rings-192.png"],
      manifest: {
        name: "Our Wedding — 우리의 결혼 준비",
        short_name: "Our Wedding",
        lang: "ko",
        start_url: base,
        scope: base,
        display: "standalone",
        background_color: "#F8F6F0",
        theme_color: "#F8F6F0",
        icons: [
          { src: `${base}icons/wedding-rings-192.png`, sizes: "192x192", type: "image/png" },
          { src: `${base}icons/wedding-rings-512.png`, sizes: "512x512", type: "image/png" }
        ]
      },
      workbox: {
        navigateFallback: "index.html",
        globPatterns: ["**/*.{js,css,html,svg,png,woff2}"],
        runtimeCaching: []
      }
    })
  ]
});
