import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/upload': {
<<<<<<< HEAD
        target: 'http://127.0.0.1:8005',
        changeOrigin: true,
      },
      '/extract': {
        target: 'http://127.0.0.1:8005',
        changeOrigin: true,
      },
      '/generate-action': {
        target: 'http://127.0.0.1:8005',
        changeOrigin: true,
      },
      '/verify': {
        target: 'http://127.0.0.1:8005',
        changeOrigin: true,
      },
      '/dashboard': {
        target: 'http://127.0.0.1:8005',
        changeOrigin: true,
      },
      '/chat': {
        target: 'http://127.0.0.1:8005',
        changeOrigin: true,
      },
      '/cases': {
        target: 'http://127.0.0.1:8005',
        changeOrigin: true,
      },
      '/case': {
        target: 'http://127.0.0.1:8005',
        changeOrigin: true,
      },
      '/translate': {
        target: 'http://127.0.0.1:8005',
=======
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
>>>>>>> ce1ac875ba943c9b0fcd915674b8341a044b5c1f
        changeOrigin: true,
      },
    },
  },
});
