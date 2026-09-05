#include "cartographer/frame"

// Roads as instanced ribbon segments draped over the height field. Each
// instance is one straight segment; the CPU splits every edge into several so
// the ribbon follows the hills.
struct RoadSegment {
  @location(0) a: vec2f,
  @location(1) b: vec2f,
  @location(2) style: vec4f, // width, brightness, highlight, pad
};

struct RoadOut {
  @builtin(position) position: vec4f,
  @location(0) uv: vec2f,
  @location(1) style: vec4f,
  @location(2) across: f32,
};

var<private> QUAD: array<vec2f, 6> = array<vec2f, 6>(
  vec2f(0.0, -1.0), vec2f(1.0, -1.0), vec2f(0.0, 1.0),
  vec2f(0.0, 1.0), vec2f(1.0, -1.0), vec2f(1.0, 1.0),
);

@vertex
fn vs(@builtin(vertex_index) vertexIndex: u32, seg: RoadSegment) -> RoadOut {
  let corner = QUAD[vertexIndex % 6u];
  let dir = normalize(seg.b - seg.a);
  let side = vec2f(-dir.y, dir.x);
  let along = mix(seg.a, seg.b, corner.x);
  let xz = along + side * corner.y * seg.style.x * 0.5;
  let uv = worldToUv(xz);
  let h = heightAt(uv) + 0.22;
  var out: RoadOut;
  out.position = frame.viewProj * vec4f(xz.x, h, xz.y, 1.0);
  out.uv = uv;
  out.style = seg.style;
  out.across = corner.y;
  return out;
}

@fragment
fn fs(in: RoadOut) -> @location(0) vec4f {
  let reveal = smoothstep(0.05, 0.5, textureSample(fogTex, fogSampler, in.uv).r);
  let edge = 1.0 - smoothstep(0.6, 1.0, abs(in.across));
  let base = mix(vec3f(0.55, 0.42, 0.24), vec3f(0.95, 0.72, 0.35), in.style.z);
  let night = frame.params.y;
  var colour = base * in.style.y * mix(1.0, 0.45, night);
  colour = mix(colour, vec3f(0.9, 0.6, 0.3), in.style.z * 0.5 * (0.5 + 0.5 * sin(frame.cameraPos.w * 3.0)));
  return vec4f(colour, edge * reveal * 0.95);
}
