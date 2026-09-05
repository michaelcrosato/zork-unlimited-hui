// Per-frame camera and world uniforms shared by the terrain, roads and pins.
struct Frame {
  viewProj: mat4x4f,
  sunDir: vec4f,     // xyz direction toward the sun, w = elevation (-1..1)
  cameraPos: vec4f,  // xyz eye position, w = time in seconds
  params: vec4f,     // extent, nightness, snow, danger
  params2: vec4f,    // waterLevel, heightTexels, gridCells, currentPulse
};

@group(0) @binding(0) var<uniform> frame: Frame;
@group(0) @binding(1) var heightTex: texture_2d<f32>;
@group(0) @binding(2) var fogTex: texture_2d<f32>;
@group(0) @binding(3) var fogSampler: sampler;

fn heightAt(uv: vec2f) -> f32 {
  let texels = frame.params2.y;
  let coord = vec2i(clamp(uv, vec2f(0.0), vec2f(0.9999)) * texels);
  return textureLoad(heightTex, coord, 0).r;
}

fn worldToUv(xz: vec2f) -> vec2f {
  return xz / frame.params.x + 0.5;
}

fn skyColour(nightness: f32) -> vec3f {
  return mix(vec3f(0.66, 0.74, 0.84), vec3f(0.03, 0.04, 0.08), nightness);
}
