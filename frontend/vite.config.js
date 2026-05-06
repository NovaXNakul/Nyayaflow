import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const proxyTarget = process.env.VITE_API_URL || "http://127.0.0.1:8000";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/auth': { target: proxyTarget, changeOrigin: true },
      '/upload': { target: proxyTarget, changeOrigin: true },
      '/extract': { target: proxyTarget, changeOrigin: true },
      '/generate-action': { target: proxyTarget, changeOrigin: true },
      '/verify': { target: proxyTarget, changeOrigin: true },
      '/dashboard': { target: proxyTarget, changeOrigin: true },
      '/chat': { target: proxyTarget, changeOrigin: true },
      '/cases': { target: proxyTarget, changeOrigin: true },
      '/case': { target: proxyTarget, changeOrigin: true },
      '/translate': { target: proxyTarget, changeOrigin: true },
      '/tasks': { target: proxyTarget, changeOrigin: true },
      '/users': { target: proxyTarget, changeOrigin: true },
      '/download': { target: proxyTarget, changeOrigin: true },
    },
  },
});
