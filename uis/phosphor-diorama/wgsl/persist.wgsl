// Phosphor persistence: the freshly drawn text lands at full brightness and
// what was there before decays, so moving or changing text leaves a fading
// trail the way a slow phosphor does.
struct PersistUniforms {
  decay: f32,
  _pad0: f32,
  _pad1: f32,
  _pad2: f32,
};

@group(0) @binding(0) var<uniform> u: PersistUniforms;
@group(0) @binding(1) var samp: sampler;
@group(0) @binding(2) var textTex: texture_2d<f32>;
@group(0) @binding(3) var previous: texture_2d<f32>;

@fragment
fn fs(@location(0) uv: vec2f) -> @location(0) vec4f {
  let fresh = textureSample(textTex, samp, uv);
  let old = textureSample(previous, samp, uv) * u.decay;
  return max(fresh, old);
}
