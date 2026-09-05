#include "hash"
struct Flow { screen: vec4f, scene: vec4f, beat: vec4f, pointer: vec4f };
struct Mark { point: vec4f, tangent: vec4f, color: vec4f };
@group(0) @binding(0) var<uniform> u: Flow;
@group(0) @binding(1) var<storage,read_write> state: array<Mark>;
@group(0) @binding(2) var<storage,read> marks: array<Mark>;
@compute @workgroup_size(256)
fn update(@builtin(global_invocation_id) id: vec3u) {
  let i = id.x; if (i >= arrayLength(&state)) { return; }
  let h = hash22(vec2f(f32(i)*0.713, u.scene.x*0.03));
  let h2 = hash22(vec2f(f32(i)*0.331+27.0,8.0));
  let t = u.screen.z;
  let center = select(vec2f(0.61,0.38),vec2f(0.62,0.27),u.screen.x<760.0)*u.screen.xy;
  var destination: vec2f;
  var tangent: vec2f;
  var width: f32;
  var length: f32;
  var color: vec4f;
  if (u.pointer.w < 0.5) {
    let a = h.x*6.2831853+t*0.028;
    let lobes = 4.0+floor(u.scene.z*6.0);
    let r = pow(h.y,0.6)*(0.58+sin(a*lobes+u.scene.x)*0.18+cos(a*3.0-t*0.06)*0.09);
    destination = center+vec2f(cos(a),sin(a))*r*u.screen.y*0.66;
    destination += vec2f(sin(a*7.0+r*25.0),cos(a*5.0+r*19.0))*u.screen.y*0.022;
    tangent = normalize(vec2f(-sin(a+r*3.0),cos(a+r*3.0)));
    let blue = vec3f(0.025,0.09,0.38);
    let coral = vec3f(0.76,0.15,0.08);
    let gold = vec3f(1.1,0.69,0.2);
    color = vec4f(mix(blue,coral,smoothstep(-0.3,0.3,sin(a*2.0+u.scene.x*0.05)+u.scene.y*0.5)),0.18);
    color = mix(color,vec4f(gold,0.25),step(0.985-u.scene.z*0.04,h2.x));
    width = 0.6+h2.x*3.7; length = 4.0+h2.y*23.0;
  } else {
    let speed = 0.04+u.scene.y*0.055+u.beat.z*0.2+u.beat.y*0.1+u.beat.w*0.15+u.pointer.z*0.012;
    let z = 0.15+fract(h.y-t*speed)*5.0;
    let a = h.x*6.2831853+t*0.06+z*0.35;
    let r = 0.5+pow(h2.x,0.35)*2.5+u.beat.w*0.7;
    destination = center+vec2f(cos(a),sin(a))*r/z*u.screen.y*0.31;
    tangent = normalize(destination-center+vec2f(0.001));
    width = (0.45+h2.x*1.4)/z;
    length = (1.5+h2.y*12.0+u.beat.z*75.0+u.beat.y*48.0)/z;
    let acid = vec3f(0.8,2.0,0.12);
    let violet = vec3f(1.1,0.08,2.4);
    color = vec4f(mix(acid,violet,step(0.53,h2.y)),(0.03+u.beat.y*0.055)*(1.0-smoothstep(3.0,5.15,z)));
  }
  let pointer = u.pointer.xy*u.screen.xy;
  let separation = destination-pointer;
  destination += normalize(separation+0.01)*exp(-dot(separation,separation)/15000.0)*32.0*step(0.0,u.pointer.x);
  var item = state[i];
  // Select the initial position, then replace the whole vector (portable WGSL).
  let origin = select(item.point.xy,destination,item.point.w < 0.5 || u.screen.w == 0.0);
  item.point = vec4f(mix(origin,destination,clamp(u.screen.w*8.0,0.0,1.0)),width,1);
  item.tangent = vec4f(tangent,length,h2.x);
  item.color = color;
  state[i] = item;
}
struct Out { @builtin(position) position: vec4f, @location(0) uv: vec2f, @location(1) color: vec4f, @location(2) seed: f32, @location(3) screen: vec2f };
@vertex
fn vs(@builtin(vertex_index) v: u32, @builtin(instance_index) i: u32) -> Out {
  let m = marks[i];
  let corners = array<vec2f,6>(vec2f(-1,-1),vec2f(1,-1),vec2f(-1,1),vec2f(-1,1),vec2f(1,-1),vec2f(1,1));
  let uv = corners[v];
  let normal = vec2f(-m.tangent.y,m.tangent.x);
  let pixel = m.point.xy+m.tangent.xy*uv.x*m.tangent.z+normal*uv.y*m.point.z;
  var o: Out;
  o.position = vec4f(pixel.x/u.screen.x*2.0-1.0,1.0-pixel.y/u.screen.y*2.0,0,1);
  o.uv = uv; o.color=m.color; o.seed=m.tangent.w; o.screen=pixel/u.screen.xy;
  return o;
}
@fragment
fn fs(o: Out) -> @location(0) vec4f {
  let edge = (1.0-smoothstep(0.35,1.0,abs(o.uv.y)))*(1.0-smoothstep(0.4,1.0,abs(o.uv.x)));
  let bristle = 0.65+0.35*sin(o.uv.y*32.0+o.seed*91.0);
  let left=(1.0-smoothstep(0.30,0.49,o.screen.x))*smoothstep(0.40,0.58,o.screen.y);
  let right=smoothstep(0.68,0.76,o.screen.x)*smoothstep(0.28,0.43,o.screen.y);
  let mobile=max(smoothstep(0.37,0.51,o.screen.y),select(1.0-smoothstep(0.20,0.30,o.screen.y),0.0,u.pointer.w>0.5));
  let reading=select(max(left,right),mobile,u.screen.x<760.0);
  return vec4f(o.color.rgb,o.color.a*edge*select(bristle,1.0,u.pointer.w>0.5)*(1.0-reading*0.97));
}
