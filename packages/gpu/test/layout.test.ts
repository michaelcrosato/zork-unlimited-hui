import { describe, expect, it } from "vitest";
import { layoutText } from "@hui/gpu";

const opts = { maxWidth: 100, size: 16, lineHeight: 20, measure: () => 10 };

describe("layoutText", () => {
  it("wraps words so no line exceeds the maximum width", () => {
    const layout = layoutText("the quick brown fox", opts);
    expect(layout.lines).toEqual(["the quick", "brown fox"]);
    expect(layout.height).toBe(40);
  });

  it("breaks a single word only when it is wider than a whole line", () => {
    const layout = layoutText("supercalifragilistic", opts);
    expect(layout.lines).toEqual(["supercalif", "ragilistic"]);
  });

  it("starts a new line at an explicit newline", () => {
    expect(layoutText("first line\nsecond", opts).lines).toEqual(["first line", "second"]);
  });

  it("keeps a blank line for an empty paragraph", () => {
    expect(layoutText("a\n\nb", opts).lines).toEqual(["a", "", "b"]);
  });

  it("places every glyph inside the column with increasing indices", () => {
    const layout = layoutText("the quick brown fox jumps", opts);
    let previous = -1;
    for (const glyph of layout.glyphs) {
      expect(glyph.x).toBeGreaterThanOrEqual(0);
      expect(glyph.x + glyph.w).toBeLessThanOrEqual(opts.maxWidth);
      expect(glyph.index).toBeGreaterThan(previous);
      previous = glyph.index;
      expect(glyph.ch).not.toBe(" ");
    }
    expect(layout.glyphs.filter((g) => g.line === 0)).toHaveLength(8);
  });

  it("puts each glyph on its line's vertical slot", () => {
    const layout = layoutText("a\nb", opts);
    expect(layout.glyphs.map((g) => g.y)).toEqual([0, 20]);
  });

  it("returns an empty layout for empty text", () => {
    const layout = layoutText("", opts);
    expect(layout.lines).toEqual([]);
    expect(layout.glyphs).toEqual([]);
    expect(layout.height).toBe(0);
  });

  it("reports the widest line as the layout width", () => {
    expect(layoutText("ab\nabcd", opts).width).toBe(40);
  });
});
