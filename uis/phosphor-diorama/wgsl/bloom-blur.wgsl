// One direction of a separable Gaussian blur at reduced resolution.
struct BlurUniforms {
  direction: vec2f,
  texel: vec2f,
};

@group(0) @binding(0) var<uniform> u: BlurUniforms;
@group(0) @binding(1) var samp: sampler;
@group(0) @binding(2) var source: texture_2d<f32>;

@fragment
fn fs(@location(0) uv: vec2f) -> @location(0) vec4f {
  let weights = array<f32, 5>(0.227, 0.194, 0.121, 0.054, 0.016);
  var colour = textureSample(source, samp, uv).rgb * weights[0];
  for (var i = 1; i < 5; i++) {
    let offset = u.direction * u.texel * f32(i) * 1.5;
    colour += textureSample(source, samp, uv + offset).rgb * weights[i];
    colour += textureSample(source, samp, uv - offset).rgb * weights[i];
  }
  return vec4f(colour, 1.0);
}
