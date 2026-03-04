import { defineConfig } from 'vite'
import { resolve } from 'path'

export default defineConfig({
  server: {
    proxy: {
      "/api": {
        target: 'http://127.0.0.1:8787',
        changeOrigin: true,
      },
    },
  },

  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        admin: resolve(__dirname, 'admin.html'),
        inventory: resolve(__dirname, "inventory.html"), 
      },
    },
  },
})
