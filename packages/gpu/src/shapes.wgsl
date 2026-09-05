struct Frame { viewport: vec2f, pad: vec2f };
@group(0) @binding(0) var<uniform> u: Frame;
struct Out {
  @builtin(position) position: vec4f,
  @location(0) local: vec2f,
  @location(1) size: vec2f,
  @location(2) color: vec4f,
  @location(3) style: vec4f,
};
@vertex
fn vs(@builtin(vertex_index) i: u32, @location(0) rect: vec4f,
      @location(1) color: vec4f, @location(2) style: vec4f) -> Out {
  let corners = array<vec2f, 6>(vec2f(0,0), vec2f(1,0), vec2f(0,1), vec2f(0,1), vec2f(1,0), vec2f(1,1));
  let p = corners[i];
  let xy = rect.xy + p * rect.zw;
  var o: Out;
  o.position = vec4f(xy.x / u.viewport.x * 2.0 - 1.0, 1.0 - xy.y / u.viewport.y * 2.0, 0, 1);
  o.local = (p - 0.5) * rect.zw;
  o.size = rect.zw;
  o.color = color;
  o.style = style;
  return o;
}
@fragment
fn fs(o: Out) -> @location(0) vec4f {
  let radius = min(o.style.x, min(o.size.x, o.size.y) * 0.5);
  let q = abs(o.local) - o.size * 0.5 + radius;
  var d = length(max(q, vec2f(0))) + min(max(q.x, q.y), 0.0) - radius;
  if (o.style.z > 0.5) { d = length(o.local / (o.size * 0.5)) * min(o.size.x, o.size.y) * 0.5 - min(o.size.x, o.size.y) * 0.5; }
  if (o.style.y > 0.0) { d = abs(d + o.style.y * 0.5) - o.style.y * 0.5; }
  let alpha = 1.0 - smoothstep(-0.8, 0.8, d);
  return vec4f(o.color.rgb, o.color.a * alpha);
}
