import { describe, expect, it } from "vitest";
import { buildSdfFromAlpha } from "@hui/gpu";

const W = 32;
const H = 32;

function filledSquare(): Uint8Array {
  const alpha = new Uint8Array(W * H);
  for (let y = 8; y < 24; y++) for (let x = 8; x < 24; x++) alpha[y * W + x] = 255;
  return alpha;
}

describe("buildSdfFromAlpha", () => {
  const sdf = buildSdfFromAlpha(filledSquare(), W, H, 8);

  it("returns one byte per pixel", () => {
    expect(sdf.length).toBe(W * H);
  });

  it("is saturated inside far from any edge", () => {
    expect(sdf[16 * W + 16]).toBeGreaterThan(200);
  });

  it("is saturated outside far from any edge", () => {
    expect(sdf[0]).toBeLessThan(40);
  });

  it("puts the contour at the half value: inside neighbours above, outside neighbours below", () => {
    expect(sdf[16 * W + 23]).toBeGreaterThan(128);
    expect(sdf[16 * W + 24]).toBeLessThan(128);
  });

  it("decreases monotonically along a ray leaving the shape", () => {
    for (let x = 16; x < W - 1; x++) {
      expect(sdf[16 * W + x + 1], `x=${x}`).toBeLessThanOrEqual(sdf[16 * W + x]!);
    }
  });

  it("is symmetric for a symmetric shape", () => {
    expect(sdf[16 * W + 4]).toBe(sdf[16 * W + 27]);
    expect(sdf[4 * W + 16]).toBe(sdf[27 * W + 16]);
  });
});
