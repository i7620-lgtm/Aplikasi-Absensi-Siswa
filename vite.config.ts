import { defineConfig } from "vite";
import legacy from "@vitejs/plugin-legacy";

export default defineConfig({
  root: ".",
  plugins: [
    legacy({
      targets: ["defaults", "not IE 11"],
    }),
  ],
  server: {
    port: 3000,
    host: "0.0.0.0",
  },
  build: {
    target: "es2015",
    outDir: "dist",
    rollupOptions: {
      input: {
        main: "index.html",
      },
    },
  },
});
