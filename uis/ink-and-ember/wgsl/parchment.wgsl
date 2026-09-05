#include "noise"
#include "color"

// Procedural parchment: fibres, stains, a candle's flicker from the centre,
// soot creeping in from the edges with pressure, and a red warmth from below
// when the scene is dangerous.
struct ParchmentUniforms {
  viewport: vec2f,
  time: f32,
  candle: f32,
  soot: f32,
  danger: f32,
  inkRun: f32,
  seed: f32,
};

@group(0) @binding(0) var<uniform> u: ParchmentUniforms;

@fragment
fn fs(@location(0) uv: vec2f) -> @location(0) vec4f {
  let aspect = u.viewport.x / max(u.viewport.y, 1.0);
  let p = vec2f(uv.x * aspect, uv.y) * 3.0;
  let fibres = fbm2(p * 12.0 + vec2f(u.seed, u.seed * 0.7), 4);
  let grain = fbm2(p * 64.0 + vec2f(1.0, 9.0), 2);
  let stain = fbm2(p * 1.6 + vec2f(3.7, 1.3), 3);
  let ring = smoothstep(0.02, 0.0, abs(stain - 0.62)) * 0.5;

  var paper = vec3f(0.87, 0.79, 0.63);
  paper *= 0.9 + 0.12 * fibres + 0.05 * (grain - 0.5);
  paper = mix(paper, paper * vec3f(0.74, 0.62, 0.46), smoothstep(0.58, 0.9, stain) * 0.55 + ring);

  let slow = noise2(vec2f(u.time * 1.7, 3.1));
  let fast = noise2(vec2f(u.time * 6.3, 7.7));
  let flicker = 0.92 + 0.08 * (slow * 0.6 + fast * 0.4);
  let centre = 1.0 - smoothstep(0.15, 1.15, length((uv - vec2f(0.5, 0.42)) * vec2f(1.35, 1.0)));
  paper *= mix(0.68, 1.0, centre) * mix(1.0, flicker, u.candle);

  let edge = smoothstep(0.3, 0.98, length((uv - 0.5) * vec2f(1.25, 1.0)));
  let sootNoise = 0.55 + 0.45 * fbm2(p * 5.0 + vec2f(u.time * 0.04), 3);
  paper = mix(paper, vec3f(0.11, 0.085, 0.07), clamp(edge * u.soot * sootNoise * 1.6, 0.0, 0.92));

  paper = mix(paper, paper * vec3f(1.0, 0.68, 0.55), u.danger * 0.4 * (1.0 - uv.y) * (0.7 + 0.3 * fast));

  return vec4f(paper, 1.0);
}
