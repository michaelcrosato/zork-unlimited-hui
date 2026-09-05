#include "noise"
#include "color"

// Final composite: film grain, a soft vignette, and on a death ending the
// whole page's ink runs downward in noisy streaks and loses its colour.
struct PostUniforms {
  viewport: vec2f,
  time: f32,
  inkRun: f32,
  grain: f32,
  vignetteStrength: f32,
  _pad: vec2f,
};

@group(0) @binding(0) var<uniform> u: PostUniforms;
@group(0) @binding(1) var samp: sampler;
@group(0) @binding(2) var sceneTex: texture_2d<f32>;

@fragment
fn fs(@location(0) uv: vec2f) -> @location(0) vec4f {
  var q = uv;
  if (u.inkRun > 0.0) {
    let streak = fbm2(vec2f(uv.x * 42.0, u.time * 0.25), 3);
    let run = u.inkRun * (0.015 + 0.1 * streak) * smoothstep(0.0, 0.7, uv.y);
    let jitter = 0.5 + 0.5 * noise2(vec2f(uv.x * 90.0, uv.y * 12.0 + u.time * 0.5));
    q.y -= run * jitter;
  }
  var colour = textureSample(sceneTex, samp, q).rgb;
  if (u.inkRun > 0.0) {
    let grey = vec3f(luminance(colour)) * vec3f(0.92, 0.86, 0.8);
    colour = mix(colour, grey, u.inkRun * 0.55);
    colour *= 1.0 - 0.15 * u.inkRun;
  }
  let g = (hash21(floor(uv * u.viewport * 0.5) + vec2f(fract(u.time) * 61.0)) - 0.5) * u.grain;
  colour += g;
  colour *= vignette(uv, u.vignetteStrength);
  return vec4f(colour, 1.0);
}
