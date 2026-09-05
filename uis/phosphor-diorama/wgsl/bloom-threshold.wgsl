#include "color"

// Bright-pass for the bloom: glowing text and the room's emissive forms.
struct ThresholdUniforms {
  threshold: f32,
  textGain: f32,
  sceneGain: f32,
  _pad: f32,
};

@group(0) @binding(0) var<uniform> u: ThresholdUniforms;
@group(0) @binding(1) var samp: sampler;
@group(0) @binding(2) var phosphor: texture_2d<f32>;
@group(0) @binding(3) var scene: texture_2d<f32>;

@fragment
fn fs(@location(0) uv: vec2f) -> @location(0) vec4f {
  let text = textureSample(phosphor, samp, uv).rgb * u.textGain;
  let room = textureSample(scene, samp, uv).rgb;
  let hot = max(room - vec3f(u.threshold), vec3f(0.0)) * u.sceneGain;
  return vec4f(text + hot, 1.0);
}
