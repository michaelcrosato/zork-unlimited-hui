import { describe, expect, it } from "vitest";
import { paintFog } from "../fog.ts";

const extent = 200;
const size = 128;
const points = [
  { id: "visited", x: 0, z: 0 },
  { id: "seen", x: 60, z: 0 },
  { id: "unknown", x: -60, z: 60 },
];
const knowledge = new Map([
  ["visited", { visited: true, discovered: true }],
  ["seen", { visited: false, discovered: true }],
  ["unknown", { visited: false, discovered: false }],
]);

function at(fog: Uint8Array, x: number, z: number): number {
  const px = Math.round(((x + extent / 2) / extent) * (size - 1));
  const pz = Math.round(((z + extent / 2) / extent) * (size - 1));
  return fog[pz * size + px]!;
}

describe("paintFog", () => {
  const fog = paintFog(size, extent, points, knowledge, { visitedRadius: 22, discoveredRadius: 12 });

  it("produces one byte per texel", () => {
    expect(fog.length).toBe(size * size);
  });

  it("fully reveals a visited town", () => {
    expect(at(fog, 0, 0)).toBe(255);
  });

  it("partly reveals a discovered town", () => {
    const value = at(fog, 60, 0);
    expect(value).toBeGreaterThan(90);
    expect(value).toBeLessThan(255);
  });

  it("leaves unknown towns and empty land hidden", () => {
    expect(at(fog, -60, 60)).toBe(0);
    expect(at(fog, 90, -90)).toBe(0);
  });

  it("fades from the centre outward", () => {
    const centre = at(fog, 0, 0);
    const mid = at(fog, 12, 0);
    const edge = at(fog, 21, 0);
    expect(centre).toBeGreaterThanOrEqual(mid);
    expect(mid).toBeGreaterThan(edge);
  });
});
