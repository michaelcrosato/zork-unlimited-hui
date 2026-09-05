import { describe, expect, it } from "vitest";
import { preprocessWgsl } from "@hui/gpu";

const libs = {
  hash: "fn hash11(p: f32) -> f32 { return fract(sin(p) * 43758.5453); }",
  noise: '#include "hash"\nfn noise1(p: f32) -> f32 { return hash11(floor(p)); }',
};

describe("preprocessWgsl", () => {
  it("replaces an include line with the library source", () => {
    const out = preprocessWgsl('#include "hash"\nfn main() {}', libs);
    expect(out).toContain("fn hash11");
    expect(out).not.toContain("#include");
    expect(out).toContain("fn main() {}");
  });

  it("resolves nested includes and includes each library once", () => {
    const out = preprocessWgsl('#include "noise"\n#include "hash"\nfn main() {}', libs);
    expect(out.match(/fn hash11/g)).toHaveLength(1);
    expect(out).toContain("fn noise1");
    expect(out).not.toContain("#include");
  });

  it("throws a clear error for an unknown include", () => {
    expect(() => preprocessWgsl('#include "missing"', libs)).toThrow(/unknown wgsl include "missing"/i);
  });

  it("leaves source without includes unchanged", () => {
    const source = "@fragment fn fs() -> @location(0) vec4f { return vec4f(1.0); }";
    expect(preprocessWgsl(source, libs)).toBe(source);
  });
});
