#include "hash"
#include "color"

// Sky behind the map table: a horizon gradient that follows the in-game clock,
// a warm band where the sun sits, and stars that come out at night.
struct SkyUniforms {
  viewport: vec2f,
  time: f32,
  nightness: f32,
  sunScreen: vec2f,   // approximate screen position of the sun, 0..1
  sunElevation: f32,
  _pad: f32,
};

@group(0) @binding(0) var<uniform> u: SkyUniforms;

@fragment
fn fs(@location(0) uv: vec2f) -> @location(0) vec4f {
  let zenith = mix(vec3f(0.36, 0.52, 0.78), vec3f(0.01, 0.015, 0.04), u.nightness);
  let horizon = mix(vec3f(0.80, 0.82, 0.86), vec3f(0.05, 0.06, 0.11), u.nightness);
  var colour = mix(horizon, zenith, smoothstep(0.35, 1.0, 1.0 - uv.y));
  // Dawn and dusk warm the horizon.
  let lowSun = 1.0 - smoothstep(0.0, 0.35, abs(u.sunElevation));
  colour = mix(colour, vec3f(0.95, 0.55, 0.32), lowSun * (1.0 - smoothstep(0.3, 0.9, 1.0 - uv.y)) * 0.55);
  let toSun = length((uv - u.sunScreen) * vec2f(u.viewport.x / u.viewport.y, 1.0));
  colour += vec3f(1.0, 0.9, 0.7) * exp(-toSun * 9.0) * clamp(u.sunElevation + 0.2, 0.0, 1.0) * 0.8;
  // Stars.
  let cell = floor(uv * vec2f(420.0, 240.0));
  let star = step(0.9965, hash21(cell)) * (0.6 + 0.4 * sin(u.time * 2.0 + hash21(cell + 7.0) * 30.0));
  colour += vec3f(star) * u.nightness * smoothstep(0.3, 1.0, 1.0 - uv.y);
  return vec4f(colour, 1.0);
}
