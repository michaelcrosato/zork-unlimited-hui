#include "hash"

// A translucent slate behind the text panel plus a soft floor vignette so
// labels stay legible over bright terrain.
struct PanelUniforms {
  viewport: vec2f,
  panelX: f32,
  panelTop: f32,
  alpha: f32,
  time: f32,
  _pad: vec2f,
};

@group(0) @binding(0) var<uniform> u: PanelUniforms;

@fragment
fn fs(@location(0) uv: vec2f) -> @location(0) vec4f {
  let px = uv * u.viewport;
  let insideX = smoothstep(u.panelX - 48.0, u.panelX + 12.0, px.x);
  let insideY = smoothstep(u.panelTop - 40.0, u.panelTop + 10.0, px.y);
  let panel = insideX * insideY * u.alpha;
  let floorShade = smoothstep(u.viewport.y * 0.78, u.viewport.y, px.y) * 0.35;
  let grain = (hash21(floor(px * 0.5) + vec2f(u.time)) - 0.5) * 0.03;
  let a = clamp(max(panel, floorShade) + grain * panel, 0.0, 1.0);
  return vec4f(vec3f(0.035, 0.05, 0.07), a);
}
