import { describe, expect, it } from "vitest";
import { projectNodes } from "../projection.ts";

const towns = [
  { id: "albany", lat: 42.65, lon: -73.75 },
  { id: "nyc", lat: 40.66, lon: -73.94 },
  { id: "buffalo", lat: 42.89, lon: -78.88 },
  { id: "montauk", lat: 41.04, lon: -71.95 },
];

describe("projectNodes", () => {
  it("keeps east to the right and north toward negative z", () => {
    const { points } = projectNodes(towns, 200);
    const by = Object.fromEntries(points.map((p) => [p.id, p]));
    expect(by.montauk!.x).toBeGreaterThan(by.buffalo!.x);
    expect(by.buffalo!.z).toBeLessThan(by.nyc!.z);
  });

  it("fits every point inside the requested extent, centred on the origin", () => {
    const extent = 200;
    const { points } = projectNodes(towns, extent);
    for (const p of points) {
      expect(Math.abs(p.x)).toBeLessThanOrEqual(extent / 2 + 1e-6);
      expect(Math.abs(p.z)).toBeLessThanOrEqual(extent / 2 + 1e-6);
    }
    const xs = points.map((p) => p.x);
    expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(extent, 5);
  });

  it("preserves relative distances along a parallel", () => {
    const { points } = projectNodes(
      [
        { id: "a", lat: 42, lon: -74 },
        { id: "b", lat: 42, lon: -73 },
        { id: "c", lat: 42, lon: -71 },
      ],
      300,
    );
    const [a, b, c] = points;
    expect((c!.x - b!.x) / (b!.x - a!.x)).toBeCloseTo(2, 5);
  });

  it("maps identical coordinates to identical points", () => {
    const { points } = projectNodes([{ id: "a", lat: 42, lon: -74 }, { id: "b", lat: 42, lon: -74 }, { id: "c", lat: 43, lon: -75 }], 100);
    expect(points[0]!.x).toBe(points[1]!.x);
    expect(points[0]!.z).toBe(points[1]!.z);
  });

  it("returns a usable scale for a single node", () => {
    const { points, scale } = projectNodes([{ id: "only", lat: 42, lon: -74 }], 100);
    expect(points[0]).toEqual({ id: "only", x: 0, z: 0 });
    expect(Number.isFinite(scale)).toBe(true);
    expect(scale).toBeGreaterThan(0);
  });
});
