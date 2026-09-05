#include "noise"
struct Flow { screen: vec4f, scene: vec4f, beat: vec4f, pointer: vec4f };
@group(0) @binding(0) var<uniform> u: Flow;
fn turn(a: f32) -> mat2x2f { return mat2x2f(cos(a),sin(a),-sin(a),cos(a)); }
fn box(p: vec3f, b: vec3f) -> f32 { let q=abs(p)-b; return length(max(q,vec3f(0)))+min(max(q.x,max(q.y,q.z)),0.0); }
fn gate(p: vec3f) -> f32 {
  let octagon = max(max(abs(p.x),abs(p.y)),(abs(p.x)+abs(p.y))*0.70710678);
  return length(vec2f(octagon-(1.65+u.beat.w*0.8),p.z))-0.055;
}
// Five rotating, physically spaced gates, floating obelisks and a reflective floor.
fn map(p: vec3f) -> vec2f {
  var q=p;
  let index=floor((p.z+1.1)/2.2);
  q.z=fract((p.z+1.1)/2.2)*2.2-1.1;
  q=vec3f(turn(index*0.19+sin(u.screen.z*0.17+index)*0.08+u.scene.x*0.02+u.beat.w*index*0.24)*q.xy,q.z);
  let g=gate(q);
  var result=vec2f(g,1.0+fract(index*0.37));
  let rail=box(vec3f(abs(q.x)-2.3,q.y,q.z),vec3f(0.055,2.2,0.28));
  if (rail<result.x) { result=vec2f(rail,2.0); }
  let floorDistance=p.y+2.25;
  if (floorDistance<result.x) { result=vec2f(floorDistance,3.0); }
  return result;
}
@fragment
fn fs(@location(0) uv: vec2f) -> @location(0) vec4f {
  let aspect=u.screen.x/u.screen.y;
  let center=select(vec2f(0.59,0.40),vec2f(0.59,0.28),u.screen.x<760.0);
  let p=(uv-center)*vec2f(aspect,-1.0);
  let rush=u.beat.z*1.5+u.beat.y*0.22;
  let sway=vec2f(sin(u.screen.z*0.18)*0.1,cos(u.screen.z*0.13)*0.06);
  let ro=vec3f(sway,-4.5+fract(u.screen.z*0.025+u.scene.x*0.13)*2.2+rush);
  let rd=normalize(vec3f(p*2.4+u.pointer.xy*0.01,1.4));
  let acid=vec3f(0.6,1.5,0.04);
  let violet=vec3f(1.15,0.055,2.5);
  let threat=mix(acid,vec3f(2.0,0.15,0.035),u.scene.y*0.7+step(1.8,u.pointer.z)*0.25);
  let hot=mix(threat,vec3f(0.45,1.7,2.4),u.beat.w);
  var distance=0.0; var glow=vec3f(0); var material=0.0; var hit=false;
  for (var i=0;i<64;i++) {
    let point=ro+rd*distance;
    let d=map(point);
    let gateColor=mix(hot,violet,smoothstep(1.25,1.75,d.y));
    glow += gateColor*exp(-abs(d.x)*24.0)*0.016/(1.0+distance*0.035);
    if (d.x<0.0025) { material=d.y; hit=true; break; }
    distance+=max(d.x*0.76,0.008);
    if (distance>22.0) { break; }
  }
  var c=vec3f(0.008,0.008,0.023)+glow;
  if (hit) {
    let point=ro+rd*distance;
    let e=vec2f(0.003,0);
    let n=normalize(vec3f(map(point+e.xyy).x-map(point-e.xyy).x,map(point+e.yxy).x-map(point-e.yxy).x,map(point+e.yyx).x-map(point-e.yyx).x));
    let fresnel=pow(1.0-abs(dot(n,-rd)),3.0);
    if (material<2.0) { c+=mix(hot,violet,smoothstep(1.25,1.75,material))*(1.5+fresnel*2.0)*exp(-distance*0.055); }
    else if (material<2.5) { c+=vec3f(0.035,0.05,0.075)+violet*fresnel*0.75; }
    else {
      let grid=pow(max(abs(sin(point.x*2.0)),abs(sin(point.z*2.0))),48.0);
      c+=mix(hot,violet,0.5)*grid*0.12+glow*0.65;
    }
  }
  let radius=length(p);
  let core=exp(-radius*radius*95.0);
  let halo=exp(-abs(radius-(0.14+u.beat.w*0.12))*75.0);
  let ring=atan2(p.y,p.x);
  c+=mix(violet,hot,u.scene.z)*(core*0.65+halo*(0.6+u.beat.y*1.5))*(0.65+0.35*sin(ring*16.0+u.screen.z));
  c+=vec3f(0.35,0.5,0.8)*exp(-abs(p.y)*135.0)*exp(-abs(p.x)*2.0)*(0.18+u.beat.w);
  // Keep the reading columns dark; the portal remains luminous between them.
  let left=(1.0-smoothstep(0.27,0.37,uv.x))*smoothstep(0.30,0.48,uv.y);
  let right=smoothstep(0.71,0.79,uv.x)*smoothstep(0.31,0.44,uv.y);
  c*=1.0-max(left,right)*0.86;
  c*=1.0-smoothstep(0.75,1.6,radius)*0.7;
  return vec4f(c,1);
}
