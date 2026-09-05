import { describe, expect, it } from "vitest";
import { cameraPosition, easeInOut, flyTo, perspective, transformPoint, viewMatrix, type CameraState } from "../camera.ts";

const home: CameraState = { target: [0, 0, 0], distance: 60, yaw: 0.3, pitch: 0.9 };
const away: CameraState = { target: [40, 0, -25], distance: 30, yaw: 1.1, pitch: 0.6 };

describe("camera", () => {
  it("flyTo starts at the origin state and ends at the destination", () => {
    expect(flyTo(home, away, 0)).toEqual(home);
    expect(flyTo(home, away, 1)).toEqual(away);
  });

  it("flyTo eases smoothly and monotonically", () => {
    let previous = flyTo(home, away, 0).target[0];
    for (let t = 0.1; t <= 1; t += 0.1) {
      const x = flyTo(home, away, t).target[0];
      expect(x).toBeGreaterThanOrEqual(previous);
      previous = x;
    }
    expect(easeInOut(0.5)).toBeCloseTo(0.5, 5);
    expect(easeInOut(0.1)).toBeLessThan(0.1);
  });

  it("keeps the eye at the requested distance from the target", () => {
    const eye = cameraPosition(home);
    const d = Math.hypot(eye[0] - home.target[0], eye[1] - home.target[1], eye[2] - home.target[2]);
    expect(d).toBeCloseTo(home.distance, 5);
    expect(eye[1]).toBeGreaterThan(home.target[1]);
  });

  it("the view matrix puts the target straight ahead of the eye", () => {
    const v = viewMatrix(away);
    const p = transformPoint(v, away.target);
    // Float32Array storage limits precision to ~1e-5 at these magnitudes.
    expect(Math.abs(p[0])).toBeLessThan(1e-4);
    expect(Math.abs(p[1])).toBeLessThan(1e-4);
    expect(p[2]).toBeCloseTo(-away.distance, 3);
  });

  it("the perspective matrix maps the near plane to depth 0 and the far plane to depth 1", () => {
    const m = perspective(Math.PI / 3, 16 / 9, 1, 500);
    const near = transformPoint(m, [0, 0, -1]);
    const far = transformPoint(m, [0, 0, -500]);
    expect(near[2]).toBeCloseTo(0, 5);
    expect(far[2]).toBeCloseTo(1, 5);
  });
});
