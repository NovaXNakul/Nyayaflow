import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/upload': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
      },
      '/extract': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
      },
      '/generate-action': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
      },
      '/verify': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
      },
      '/dashboard': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
      },
      '/chat': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
      },
      '/cases': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
      },
      '/case': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
      },
    },
  },
});
