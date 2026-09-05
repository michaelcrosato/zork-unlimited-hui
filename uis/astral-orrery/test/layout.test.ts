import { describe, expect, it } from "vitest";
import { createMockClient } from "@hui/core";
import { orreryLayout, satellites } from "../layout.ts";

describe("action satellites", () => {
  it("preserves primary numbering and disabled targets without inventing actions", () => {
    const client = createMockClient(); client.act("meta:begin");
    const scene = client.scene();
    scene.actions[0]!.disabledReason = "Unavailable.";
    const nodes = satellites(scene, orreryLayout(1600, 1000).instrument);
    expect(nodes.map(n => n.id)).toEqual(scene.actions.filter(a => a.primary).map(a => a.id));
    expect(nodes[0]!.disabled).toBe(true);
    nodes.forEach((n, i) => expect(n.number).toBe(i + 1));
    for (const a of nodes) for (const b of nodes) if (a !== b) expect(Math.hypot(a.cx - b.cx, a.cy - b.cy)).toBeGreaterThan(46);
    expect(nodes).toEqual(satellites(scene, orreryLayout(1600, 1000).instrument));
  });
  it.each([[320, 568], [390, 844], [844, 390], [1024, 768], [1600, 1000], [2560, 1440]])("keeps its reading area inside %sx%s", (w, h) => {
    const layout = orreryLayout(w, h);
    for (const r of layout.mobile ? [layout.story] : [layout.story, layout.actions]) {
      expect(r.width).toBeGreaterThan(200);
      expect(r.x + r.width).toBeLessThanOrEqual(w);
      expect(r.y + r.height).toBeLessThanOrEqual(h);
    }
  });
});
