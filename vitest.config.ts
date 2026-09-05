import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
import { engineStatus } from "./scripts/engine-path.mjs";

const here = (path: string): string => fileURLToPath(new URL(path, import.meta.url));
const engine = engineStatus();

export default defineConfig({
  resolve: {
    alias: [
      { find: "@hui/core", replacement: here("./packages/core/src/index.ts") },
      { find: "@hui/gpu", replacement: here("./packages/gpu/src/index.ts") },
      { find: "@hui/shell", replacement: here("./packages/shell/src/index.ts") },
      { find: "@zork-adapter", replacement: here("./packages/core/src/zork/adapter.stub.ts") },
      // The engine's browser-safe source, when a sibling checkout exists. Tests that
      // need it skip themselves otherwise, so a dangling alias is harmless.
      { find: /^@zork\/(.*)$/, replacement: `${engine.root.replaceAll("\\", "/")}/src/$1` },
      // The package ships a CommonJS main under "type": "module"; point at its ESM build.
      { find: "wgsl_reflect", replacement: here("./node_modules/wgsl_reflect/wgsl_reflect.module.js") },
    ],
  },
  test: {
    include: ["packages/*/test/**/*.test.ts", "uis/*/test/**/*.test.ts", "tests/unit/**/*.test.ts"],
    environment: "node",
    reporters: ["dot"],
    testTimeout: 60_000,
    passWithNoTests: true,
  },
});
