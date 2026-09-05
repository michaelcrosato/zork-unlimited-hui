// Instanced signed-distance-field glyphs. One instance per glyph; six vertices
// per instance. Per-glyph params drive the "wet ink" reveal (t0), a tremble
// (wobble), a weight bias and an edge softness, so interfaces can animate
// typography without touching the pipeline.
struct TextUniforms {
  viewport: vec2f,
  time: f32,
  pxRange: f32,
};

struct GlyphInstance {
  @location(0) rect: vec4f,    // x, y, w, h in CSS pixels
  @location(1) uv: vec4f,      // u0, v0, u1, v1 in the atlas
  @location(2) color: vec4f,
  @location(3) params: vec4f,  // t0 (seconds), wobble (px), weight bias, softness
};

struct VertexOut {
  @builtin(position) position: vec4f,
  @location(0) uv: vec2f,
  @location(1) color: vec4f,
  @location(2) params: vec4f,
  @location(3) local: vec2f,
};

@group(0) @binding(0) var<uniform> u: TextUniforms;
@group(0) @binding(1) var atlasTexture: texture_2d<f32>;
@group(0) @binding(2) var atlasSampler: sampler;

var<private> QUAD: array<vec2f, 6> = array<vec2f, 6>(
  vec2f(0.0, 0.0), vec2f(1.0, 0.0), vec2f(0.0, 1.0),
  vec2f(0.0, 1.0), vec2f(1.0, 0.0), vec2f(1.0, 1.0),
);

@vertex
fn vs(@builtin(vertex_index) vertexIndex: u32, @builtin(instance_index) instanceIndex: u32, g: GlyphInstance) -> VertexOut {
  let corner = QUAD[vertexIndex % 6u];
  let age = clamp((u.time - g.params.x) / 0.35, 0.0, 1.0);
  let tremble = g.params.y * vec2f(
    sin(u.time * 3.1 + f32(instanceIndex) * 1.7),
    cos(u.time * 2.3 + f32(instanceIndex) * 0.9),
  ) * (1.0 - age * 0.6);
  let px = g.rect.xy + corner * g.rect.zw + tremble;
  var ndc = (px / u.viewport) * 2.0 - vec2f(1.0);
  ndc.y = -ndc.y;
  var out: VertexOut;
  out.position = vec4f(ndc, 0.0, 1.0);
  out.uv = mix(g.uv.xy, g.uv.zw, corner);
  out.color = g.color;
  out.params = g.params;
  out.local = corner;
  return out;
}

@fragment
fn fs(in: VertexOut) -> @location(0) vec4f {
  let distance = textureSample(atlasTexture, atlasSampler, in.uv).r;
  let age = clamp((u.time - in.params.x) / 0.35, 0.0, 1.0);
  // Wet ink: a young glyph is a soft, heavy blot that sharpens into its shape.
  let threshold = mix(0.34, 0.5 - in.params.z, age);
  let softness = mix(0.14, max(in.params.w, 0.02), age);
  let coverage = smoothstep(threshold - softness, threshold + softness, distance);
  return vec4f(in.color.rgb, in.color.a * coverage);
}
