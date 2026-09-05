// Colour helpers: sRGB transfer, a filmic tonemap, and a vignette.
fn srgbToLinear(c: vec3f) -> vec3f {
  return pow(c, vec3f(2.2));
}

fn linearToSrgb(c: vec3f) -> vec3f {
  return pow(max(c, vec3f(0.0)), vec3f(1.0 / 2.2));
}

fn tonemapAces(x: vec3f) -> vec3f {
  let a = 2.51;
  let b = 0.03;
  let c = 2.43;
  let d = 0.59;
  let e = 0.14;
  return clamp((x * (a * x + b)) / (x * (c * x + d) + e), vec3f(0.0), vec3f(1.0));
}

fn vignette(uv: vec2f, strength: f32) -> f32 {
  let d = uv - vec2f(0.5);
  return 1.0 - strength * dot(d, d) * 2.0;
}

fn luminance(c: vec3f) -> f32 {
  return dot(c, vec3f(0.2126, 0.7152, 0.0722));
}
