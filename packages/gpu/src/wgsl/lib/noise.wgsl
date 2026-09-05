#include "hash"

// Value noise and fractal Brownian motion, 2D and 3D.
fn noise2(p: vec2f) -> f32 {
  let i = floor(p);
  let f = fract(p);
  let u = f * f * (3.0 - 2.0 * f);
  let a = hash21(i);
  let b = hash21(i + vec2f(1.0, 0.0));
  let c = hash21(i + vec2f(0.0, 1.0));
  let d = hash21(i + vec2f(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

fn fbm2(p_in: vec2f, octaves: i32) -> f32 {
  var p = p_in;
  var amplitude = 0.5;
  var total = 0.0;
  var norm = 0.0;
  for (var i = 0; i < octaves; i++) {
    total += amplitude * noise2(p);
    norm += amplitude;
    p = p * 2.03 + vec2f(17.1, 9.7);
    amplitude *= 0.5;
  }
  return total / norm;
}

fn noise3(p: vec3f) -> f32 {
  let i = floor(p);
  let f = fract(p);
  let u = f * f * (3.0 - 2.0 * f);
  let n000 = hash31(i);
  let n100 = hash31(i + vec3f(1.0, 0.0, 0.0));
  let n010 = hash31(i + vec3f(0.0, 1.0, 0.0));
  let n110 = hash31(i + vec3f(1.0, 1.0, 0.0));
  let n001 = hash31(i + vec3f(0.0, 0.0, 1.0));
  let n101 = hash31(i + vec3f(1.0, 0.0, 1.0));
  let n011 = hash31(i + vec3f(0.0, 1.0, 1.0));
  let n111 = hash31(i + vec3f(1.0, 1.0, 1.0));
  let x00 = mix(n000, n100, u.x);
  let x10 = mix(n010, n110, u.x);
  let x01 = mix(n001, n101, u.x);
  let x11 = mix(n011, n111, u.x);
  let y0 = mix(x00, x10, u.y);
  let y1 = mix(x01, x11, u.y);
  return mix(y0, y1, u.z);
}

fn fbm3(p_in: vec3f, octaves: i32) -> f32 {
  var p = p_in;
  var amplitude = 0.5;
  var total = 0.0;
  var norm = 0.0;
  for (var i = 0; i < octaves; i++) {
    total += amplitude * noise3(p);
    norm += amplitude;
    p = p * 2.02 + vec3f(11.3, 5.9, 7.7);
    amplitude *= 0.5;
  }
  return total / norm;
}
