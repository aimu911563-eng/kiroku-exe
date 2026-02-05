import { defineConfig } from "vite";

export default defineConfig({
  server: {
    proxy: {
      "/api": {
        target: "http://localhost:8787",
        changeOrigin: true,
      },
    },
  },

  // 👇 これを追加するだけ
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


