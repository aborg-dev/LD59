import { defineConfig } from "vite";

export default defineConfig({
  base: process.env.CI ? "/LD59/" : "/",
  server: {
    host: "0.0.0.0",
    allowedHosts: ["odroid"],
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("node_modules/phaser")) {
            return "phaser";
          }
        },
      },
    },
    minify: "terser",
    terserOptions: {
      compress: {
        passes: 2,
      },
      mangle: true,
      format: {
        comments: false,
      },
    },
  },
});
