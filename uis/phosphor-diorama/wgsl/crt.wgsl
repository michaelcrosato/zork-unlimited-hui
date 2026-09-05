#include "hash"
#include "noise"
#include "color"

// The glass: the diorama behind a curved tube face, phosphor text with
// chromatic fringes and scanlines, bloom, a glitch tear on damage, flicker,
// and a reflection so the screen reads as an object in a dark room.
struct CrtUniforms {
  viewport: vec2f,
  time: f32,
  glitch: f32,
  night: f32,
  danger: f32,
  textEdge: f32,
  flicker: f32,
};

@group(0) @binding(0) var<uniform> u: CrtUniforms;
@group(0) @binding(1) var samp: sampler;
@group(0) @binding(2) var diorama: texture_2d<f32>;
@group(0) @binding(3) var phosphor: texture_2d<f32>;
@group(0) @binding(4) var bloom: texture_2d<f32>;

fn curve(uv: vec2f) -> vec2f {
  let c = uv * 2.0 - 1.0;
  let r2 = dot(c, c);
  let warped = c * (1.0 + 0.045 * r2);
  return warped * 0.5 + 0.5;
}

@fragment
fn fs(@location(0) uv: vec2f) -> @location(0) vec4f {
  var q = curve(uv);
  let inside = step(0.0, q.x) * step(q.x, 1.0) * step(0.0, q.y) * step(q.y, 1.0);

  // Glitch: horizontal bands tear sideways; a permanent weak version when in danger.
  let band = floor(q.y * 36.0 + u.time * 3.0);
  let tearStrength = u.glitch * 0.9 + smoothstep(0.75, 1.0, u.danger) * 0.12;
  let tear = (hash11(band + floor(u.time * 9.0)) - 0.5) * tearStrength * step(0.55, hash11(band * 3.1 + floor(u.time * 5.0)));
  q.x += tear * 0.08;

  // Text with chromatic fringes that grow toward the edges.
  let radial = length(uv - 0.5);
  let fringe = (0.0009 + 0.004 * radial * radial) * (1.0 + u.glitch * 3.0);
  let tr = textureSample(phosphor, samp, q + vec2f(fringe, 0.0)).r;
  let tg = textureSample(phosphor, samp, q).g;
  let tb = textureSample(phosphor, samp, q - vec2f(fringe, 0.0)).b;
  let text = vec3f(tr, tg, tb);

  var room = textureSample(diorama, samp, q).rgb;
  // Darken the glass behind the text column so the phosphor reads.
  let behindText = 1.0 - smoothstep(u.textEdge - 0.03, u.textEdge + 0.02, q.x);
  room *= mix(1.0, 0.32, behindText);
  room *= 0.78;

  var colour = room + text * 1.15 + textureSample(bloom, samp, q).rgb * 0.9;

  // Scanlines and the phosphor triad shimmer.
  let line = 0.86 + 0.14 * sin(q.y * u.viewport.y * 3.14159 * 0.9);
  let triad = 0.96 + 0.04 * sin(q.x * u.viewport.x * 3.14159);
  colour *= line * triad;
  // Flicker and a slow rolling brightness bar.
  colour *= u.flicker;
  colour *= 0.97 + 0.03 * smoothstep(0.0, 0.08, abs(fract(u.time * 0.12) - q.y));
  // Death: the picture desaturates and dims.
  colour = mix(colour, vec3f(luminance(colour)) * vec3f(0.9, 1.0, 0.85), u.glitch * 0.6);

  // Glass reflection and vignette.
  let highlight = exp(-length((uv - vec2f(0.28, 0.2)) * vec2f(1.4, 2.2)) * 3.0) * 0.06;
  colour += vec3f(highlight);
  colour *= vignette(uv, 0.45);
  colour = mix(vec3f(0.01, 0.012, 0.015), colour, inside);
  colour += vec3f(hash21(uv * u.viewport + vec2f(u.time * 30.0)) - 0.5) * 0.015;
  return vec4f(tonemapAces(colour * 1.1), 1.0);
}
