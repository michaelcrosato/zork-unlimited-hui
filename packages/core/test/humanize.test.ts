import { describe, expect, it } from "vitest";
import { humanizeId } from "@hui/core";

describe("humanizeId", () => {
  it("turns an underscore id into a sentence-case phrase", () => {
    expect(humanizeId("relief_spear")).toBe("Relief spear");
  });

  it("drops a namespace prefix before the last colon", () => {
    expect(humanizeId("albany:road_warden")).toBe("Road warden");
    expect(humanizeId("wolf_winter:approach_exposed_ridge")).toBe("Approach exposed ridge");
  });

  it("treats hyphens like underscores", () => {
    expect(humanizeId("byre-yard")).toBe("Byre yard");
  });

  it("leaves text that already reads as prose untouched", () => {
    expect(humanizeId("The Byre-Yard")).toBe("The Byre-Yard");
    expect(humanizeId("Old Cade the houndsman")).toBe("Old Cade the houndsman");
  });

  it("returns an empty string unchanged", () => {
    expect(humanizeId("")).toBe("");
  });
});
