struct Step { frame: vec4f, pointer: vec4f };
@group(0) @binding(0) var<uniform> u: Step;
@group(0) @binding(1) var previous: texture_2d<f32>;
@group(0) @binding(2) var next: texture_storage_2d<rgba16float, write>;
fn height(p: vec2i) -> f32 { return textureLoad(previous, clamp(p, vec2i(0), vec2i(255)), 0).r; }
@compute @workgroup_size(8, 8)
fn step(@builtin(global_invocation_id) id: vec3u) {
  if (any(id.xy >= vec2u(256))) { return; }
  let p = vec2i(id.xy);
  let uv = (vec2f(id.xy) + 0.5) / 256.0;
  let old = textureLoad(previous, p, 0);
  let laplacian = height(p + vec2i(1,0)) + height(p - vec2i(1,0)) + height(p + vec2i(0,1)) + height(p - vec2i(0,1)) - old.r * 4.0;
  let dt = u.frame.x;
  var velocity = (old.g + laplacian * 0.14 * dt) * pow(0.986, dt);
  let source = length(uv - vec2f(0.33, 0.42));
  velocity += exp(-source * source * 2400.0) * sin(u.frame.y * 3.5) * (0.005 + u.frame.z * 0.015) * dt;
  let pointerDistance = distance(uv, u.pointer.xy);
  let impulse = exp(-pointerDistance * pointerDistance * 1700.0) * u.pointer.z;
  let burst = exp(-pow(length(uv - 0.5) - 0.2, 2.0) * 2300.0) * u.frame.w;
  let edge = smoothstep(0.0, 0.045, min(min(uv.x, uv.y), min(1.0 - uv.x, 1.0 - uv.y)));
  let h = clamp((old.r + velocity * dt + impulse + burst) * edge, -1.0, 1.0);
  textureStore(next, p, vec4f(h, clamp(velocity * edge, -0.5, 0.5), 0, 1));
}
