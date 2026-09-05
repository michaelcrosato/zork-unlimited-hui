#include "noise"

// Generate the height field once: ridged fBm hills and a broad continental
// swell, then carve a level shelf around every town so settlements sit in
// valleys and pins always have ground under them.
struct TerrainParams {
  extent: f32,
  size: f32,
  nodeCount: f32,
  seed: f32,
};

@group(0) @binding(0) var<uniform> tp: TerrainParams;
@group(0) @binding(1) var<storage, read> nodes: array<vec2f>;
@group(0) @binding(2) var heightOut: texture_storage_2d<r32float, write>;

@compute @workgroup_size(16, 16)
fn main(@builtin(global_invocation_id) id: vec3u) {
  if (f32(id.x) >= tp.size || f32(id.y) >= tp.size) { return; }
  let uv = (vec2f(f32(id.x), f32(id.y)) + 0.5) / tp.size;
  let world = (uv - 0.5) * tp.extent;
  let hills = fbm2(world * 0.05 + vec2f(tp.seed, tp.seed * 0.37), 5) * 2.0 - 1.0;
  let swell = fbm2(world * 0.011 + vec2f(3.0, 7.0), 3) * 2.0 - 1.0;
  var h = hills * 9.0 + swell * 9.0 - 1.5;
  var shelf = 0.0;
  let count = u32(tp.nodeCount);
  for (var i = 0u; i < count; i++) {
    let d = distance(world, nodes[i]);
    shelf = max(shelf, exp(-(d * d) / (2.0 * 5.0 * 5.0)));
  }
  h = mix(h, 1.5, shelf);
  textureStore(heightOut, vec2i(i32(id.x), i32(id.y)), vec4f(h, 0.0, 0.0, 0.0));
}
