export interface LayoutOptions {
  /** Column width in pixels. */
  maxWidth: number;
  /** Font size in pixels, passed through to `measure`. */
  size: number;
  /** Vertical advance per line in pixels. */
  lineHeight: number;
  /** Advance width of one character at the given size. */
  measure: (ch: string, size: number) => number;
}

export interface GlyphPlacement {
  ch: string;
  /** Left edge in pixels from the column's left. */
  x: number;
  /** Top of the line slot in pixels from the layout's top. */
  y: number;
  /** Advance width in pixels. */
  w: number;
  line: number;
  /** Running glyph number, skipping spaces; drives staggered reveals. */
  index: number;
}

export interface TextLayout {
  lines: string[];
  glyphs: GlyphPlacement[];
  /** Widest line in pixels. */
  width: number;
  /** `lines.length * lineHeight`. */
  height: number;
}

/**
 * Greedy word wrap. Words wider than the column are split by character so
 * nothing ever escapes the column. Explicit newlines start new lines and an
 * empty paragraph keeps a blank line.
 */
export function layoutText(text: string, opts: LayoutOptions): TextLayout {
  if (text.length === 0) return { lines: [], glyphs: [], width: 0, height: 0 };
  const width = (s: string): number => {
    let total = 0;
    for (const ch of s) total += opts.measure(ch, opts.size);
    return total;
  };
  const lines: string[] = [];
  for (const paragraph of text.split("\n")) {
    const words = paragraph.split(" ").filter((word) => word.length > 0);
    if (words.length === 0) {
      lines.push("");
      continue;
    }
    let current = "";
    for (const word of words) {
      const candidate = current.length > 0 ? `${current} ${word}` : word;
      if (width(candidate) <= opts.maxWidth) {
        current = candidate;
        continue;
      }
      if (current.length > 0) {
        lines.push(current);
        current = "";
      }
      if (width(word) <= opts.maxWidth) {
        current = word;
        continue;
      }
      let chunk = "";
      for (const ch of word) {
        if (chunk.length > 0 && width(chunk + ch) > opts.maxWidth) {
          lines.push(chunk);
          chunk = "";
        }
        chunk += ch;
      }
      current = chunk;
    }
    lines.push(current);
  }

  const glyphs: GlyphPlacement[] = [];
  let index = 0;
  let widest = 0;
  lines.forEach((line, lineNumber) => {
    let x = 0;
    for (const ch of line) {
      const w = opts.measure(ch, opts.size);
      if (ch !== " ") glyphs.push({ ch, x, y: lineNumber * opts.lineHeight, w, line: lineNumber, index: index++ });
      x += w;
    }
    widest = Math.max(widest, x);
  });
  return { lines, glyphs, width: widest, height: lines.length * opts.lineHeight };
}
