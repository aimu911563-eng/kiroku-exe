import { defineConfig } from "vite";

export default defineConfig({
  server: {
    host: "127.0.0.1",
    port: Number(process.env.DEV_SHIFTFLOW_WEB_PORT ?? 5174),
    strictPort: true,
    proxy: {
      "/api": {
        target: `http://127.0.0.1:${process.env.DEV_SHIFTFLOW_API_PORT ?? 8788}`,
        changeOrigin: true,
      },
    },
  },

  build: {
    rollupOptions: {
      input: {
        main: "index.html",
        admin: "admin.html",
        worktime: "worktime.html",
        worktimeAdmin: "worktime-admin.html",
      },
    },
  },
});

