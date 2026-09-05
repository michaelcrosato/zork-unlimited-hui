const INCLUDE_LINE = /^\s*#include\s+"([^"]+)"\s*$/;

/**
 * Expand `#include "name"` lines using the given library map. Each library is
 * inserted at most once per output so shared helpers can be included freely.
 * Unknown names throw, because a silent miss would surface later as an
 * opaque shader compile error on the GPU.
 */
export function preprocessWgsl(source: string, libs: Record<string, string>): string {
  const included = new Set<string>();
  const expand = (text: string): string =>
    text
      .split("\n")
      .map((line) => {
        const match = INCLUDE_LINE.exec(line);
        if (!match) return line;
        const name = match[1]!;
        if (included.has(name)) return "";
        const lib = libs[name];
        if (lib === undefined) throw new Error(`Unknown WGSL include "${name}"`);
        included.add(name);
        return expand(lib);
      })
      .join("\n");
  return expand(source);
}
