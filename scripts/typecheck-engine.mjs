// Typecheck the engine-dependent adapter only when the engine checkout is linked.
// The root tsconfig excludes those files so CI (no engine) stays green.
import { spawnSync } from "node:child_process";
import { engineLinked, engineStatus } from "./engine-path.mjs";

const status = engineStatus();
if (!status.present) {
  console.log(`engine typecheck skipped: no zork-unlimited checkout at ${status.root}`);
  process.exit(0);
}
if (!engineLinked().linked) {
  console.log("engine typecheck skipped: live adapter not present yet");
  process.exit(0);
}
const result = spawnSync("tsc", ["-p", "tsconfig.engine.json", "--noEmit"], { stdio: "inherit", shell: true });
process.exit(result.status ?? 1);
