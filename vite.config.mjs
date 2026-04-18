import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function levelSavePlugin() {
  return {
    name: "level-save",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use("/api/save-level", (req, res) => {
        if (req.method !== "POST") {
          res.statusCode = 405;
          res.end();
          return;
        }
        let body = "";
        req.on("data", (chunk) => {
          body += chunk;
        });
        req.on("end", () => {
          try {
            const { index, level } = JSON.parse(body);
            if (
              typeof index !== "number" ||
              !Number.isInteger(index) ||
              index < 0 ||
              index > 99 ||
              !level ||
              typeof level !== "object"
            ) {
              res.statusCode = 400;
              res.end(JSON.stringify({ error: "bad payload" }));
              return;
            }
            const n = String(index + 1).padStart(2, "0");
            const file = path.join(__dirname, "src/levels/tower", `${n}.json`);
            fs.writeFileSync(file, `${JSON.stringify(level, null, 2)}\n`);
            res.statusCode = 200;
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify({ ok: true, file }));
          } catch (err) {
            res.statusCode = 400;
            res.end(JSON.stringify({ error: String(err) }));
          }
        });
      });
    },
  };
}

export default defineConfig({
  base: process.env.CI ? "/LD59/" : "/",
  plugins: [levelSavePlugin()],
  server: {
    host: "0.0.0.0",
    allowedHosts: ["odroid", "spire"],
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
