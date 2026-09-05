import { readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { WgslReflect } from "wgsl_reflect";
import { preprocessWgsl } from "@hui/gpu";

const repoRoot = fileURLToPath(new URL("../../..", import.meta.url));
const libDir = join(repoRoot, "packages", "gpu", "src", "wgsl", "lib");

function wgslFiles(dir: string): string[] {
  return readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".wgsl"))
    .map((entry) => join(entry.parentPath, entry.name))
    .filter((file) => !file.includes(`${sep}node_modules${sep}`));
}

const isLibrary = (file: string): boolean => file.split(sep).includes("lib");

/**
 * Include libraries: `packages/gpu/src/wgsl/lib/<name>.wgsl` is included as
 * `<name>`; an interface's own `uis/<slug>/wgsl/lib/<name>.wgsl` as `<slug>/<name>`.
 */
function libraries(): Record<string, string> {
  const libs: Record<string, string> = {};
  for (const file of wgslFiles(libDir)) {
    libs[relative(libDir, file).replace(/\.wgsl$/, "").replaceAll("\\", "/")] = readFileSync(file, "utf8");
  }
  const uisDir = join(repoRoot, "uis");
  for (const file of wgslFiles(uisDir).filter(isLibrary)) {
    const [slug] = relative(uisDir, file).split(sep);
    libs[`${slug}/${file.slice(file.lastIndexOf(sep) + 1).replace(/\.wgsl$/, "")}`] = readFileSync(file, "utf8");
  }
  return libs;
}

const shaders = [...wgslFiles(join(repoRoot, "packages")), ...wgslFiles(join(repoRoot, "uis"))].filter((file) => !isLibrary(file));

describe("every WGSL shader in the repo", () => {
  it("has at least one shader to check", () => {
    expect(shaders.length).toBeGreaterThan(0);
  });

  it.each(shaders.map((file) => [relative(repoRoot, file), file]))("%s parses and declares an entry point", (_, file) => {
    const source = preprocessWgsl(readFileSync(file, "utf8"), libraries());
    const reflect = new WgslReflect(source);
    const entries = reflect.entry.vertex.length + reflect.entry.fragment.length + reflect.entry.compute.length;
    expect(entries).toBeGreaterThan(0);
  });
});

describe("every WGSL library", () => {
  it.each(Object.keys(libraries()))("%s parses on its own after include expansion", (name) => {
    const libs = libraries();
    expect(() => new WgslReflect(preprocessWgsl(libs[name]!, libs))).not.toThrow();
  });
});
