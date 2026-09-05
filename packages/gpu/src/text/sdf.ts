/**
 * Signed distance field from a coverage mask using the 8-point sequential
 * signed Euclidean distance transform (8SSEDT). Linear in pixel count, which
 * is what lets glyphs be added to the atlas lazily at runtime.
 *
 * Output: one byte per pixel, 128 at the contour, larger inside the shape,
 * smaller outside, saturating at ±`spread` pixels.
 */
export function buildSdfFromAlpha(alpha: Uint8Array, width: number, height: number, spread: number): Uint8Array {
  if (alpha.length !== width * height) throw new Error("alpha length does not match width * height");
  const inside = (i: number) => alpha[i]! >= 128;
  const toInside = distanceTransform(width, height, inside);
  const toOutside = distanceTransform(width, height, (i) => !inside(i));
  const out = new Uint8Array(width * height);
  for (let i = 0; i < out.length; i++) {
    const signed = inside(i) ? toOutside[i]! : -toInside[i]!;
    const normalized = Math.max(-1, Math.min(1, signed / spread));
    out[i] = Math.round(128 + normalized * 127);
  }
  return out;
}

const FAR = 1 << 14;

/** Euclidean distance from every pixel to the nearest pixel where `target` holds. */
function distanceTransform(width: number, height: number, target: (index: number) => boolean): Float32Array {
  const dx = new Int32Array(width * height);
  const dy = new Int32Array(width * height);
  for (let i = 0; i < dx.length; i++) {
    const hit = target(i);
    dx[i] = hit ? 0 : FAR;
    dy[i] = hit ? 0 : FAR;
  }
  const compare = (x: number, y: number, ox: number, oy: number): void => {
    const nx = x + ox;
    const ny = y + oy;
    if (nx < 0 || ny < 0 || nx >= width || ny >= height) return;
    const i = y * width + x;
    const j = ny * width + nx;
    const cx = dx[j]! + ox;
    const cy = dy[j]! + oy;
    if (cx * cx + cy * cy < dx[i]! * dx[i]! + dy[i]! * dy[i]!) {
      dx[i] = cx;
      dy[i] = cy;
    }
  };
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      compare(x, y, -1, 0);
      compare(x, y, 0, -1);
      compare(x, y, -1, -1);
      compare(x, y, 1, -1);
    }
    for (let x = width - 1; x >= 0; x--) compare(x, y, 1, 0);
  }
  for (let y = height - 1; y >= 0; y--) {
    for (let x = width - 1; x >= 0; x--) {
      compare(x, y, 1, 0);
      compare(x, y, 0, 1);
      compare(x, y, -1, 1);
      compare(x, y, 1, 1);
    }
    for (let x = 0; x < width; x++) compare(x, y, -1, 0);
  }
  const out = new Float32Array(width * height);
  for (let i = 0; i < out.length; i++) out[i] = Math.hypot(dx[i]!, dy[i]!);
  return out;
}
