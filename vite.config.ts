import { defineConfig } from 'vite'
import { resolve } from 'path'

export default defineConfig({
  server: {
    host: '127.0.0.1',
    port: Number(process.env.DEV_KIROKU_WEB_PORT ?? 5173),
    strictPort: true,
    proxy: {
      "/api": {
        target: `http://127.0.0.1:${process.env.DEV_KIROKU_API_PORT ?? 8787}`,
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
        inventoryAdmin: resolve(__dirname, "inventory-admin.html"),
        // inventory-date.html is an unfinished prototype; see docs/DEVELOPMENT.md.
        insight: resolve(__dirname, "insight.html"),
        order: resolve(__dirname, "order.html"),
        orderAdmin: resolve(__dirname, "order-admin.html")
      },
    },
  },
})
