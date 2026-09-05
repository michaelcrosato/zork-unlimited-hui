import color from "./lib/color.wgsl?raw";
import hash from "./lib/hash.wgsl?raw";
import noise from "./lib/noise.wgsl?raw";

/** The include map every shader in the repo may draw from. */
export const WGSL_LIBS: Record<string, string> = { color, hash, noise };
