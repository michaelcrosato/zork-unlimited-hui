import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import { zorkEnginePlugin } from "./build/engine-plugin.ts";
import { galleryPlugin } from "./build/gallery-plugin.ts";

export default defineConfig({
  plugins: [zorkEnginePlugin(), galleryPlugin()],
  resolve: {
    alias: {
      "@hui/core": fileURLToPath(new URL("./packages/core/src/index.ts", import.meta.url)),
      "@hui/gpu": fileURLToPath(new URL("./packages/gpu/src/index.ts", import.meta.url)),
      "@hui/shell": fileURLToPath(new URL("./packages/shell/src/index.ts", import.meta.url)),
    },
  },
  build: {
    target: "es2022",
    outDir: "dist",
    sourcemap: true,
    chunkSizeWarningLimit: 4000,
  },
  server: {
    port: 5180,
    strictPort: true,
  },
});
