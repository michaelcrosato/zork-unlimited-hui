import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@hui/core": fileURLToPath(new URL("./packages/core/src/index.ts", import.meta.url)),
      "@hui/gpu": fileURLToPath(new URL("./packages/gpu/src/index.ts", import.meta.url)),
      "@hui/shell": fileURLToPath(new URL("./packages/shell/src/index.ts", import.meta.url)),
      // The package ships a CommonJS main under "type": "module"; point at its ESM build.
      "@zork-adapter": fileURLToPath(new URL("./packages/core/src/zork/adapter.stub.ts", import.meta.url)),
      wgsl_reflect: fileURLToPath(new URL("./node_modules/wgsl_reflect/wgsl_reflect.module.js", import.meta.url)),
    },
  },
  test: {
    include: ["packages/*/test/**/*.test.ts", "uis/*/test/**/*.test.ts", "tests/unit/**/*.test.ts"],
    environment: "node",
    reporters: ["dot"],
    testTimeout: 60_000,
    passWithNoTests: true,
  },
});
