export type Vec3 = [number, number, number];
export type Quat = [number, number, number, number];
const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const mul = (a: Vec3, n: number): Vec3 => [a[0] * n, a[1] * n, a[2] * n];
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a: Vec3): Vec3 => mul(a, 1 / Math.max(0.0001, Math.hypot(...a)));
export function quatMultiply(a: Quat, b: Quat): Quat {
  return [a[3]*b[0]+a[0]*b[3]+a[1]*b[2]-a[2]*b[1], a[3]*b[1]-a[0]*b[2]+a[1]*b[3]+a[2]*b[0],
    a[3]*b[2]+a[0]*b[1]-a[1]*b[0]+a[2]*b[3], a[3]*b[3]-a[0]*b[0]-a[1]*b[1]-a[2]*b[2]];
}
export function rotateBy(q: Quat, v: Vec3): Vec3 {
  const t = mul(cross([q[0], q[1], q[2]], v), 2);
  return add(v, add(mul(t, q[3]), cross([q[0], q[1], q[2]], t)));
}
export interface DiceMesh { vertices: Float32Array; faces: { value: number; normal: Vec3; up: Vec3 }[] }

/** Flat normals and local numeral coordinates for every physical die face. */
export function diceMesh(sides: 6 | 20): DiceMesh {
  const data: number[] = [];
  const faces: DiceMesh["faces"] = [];
  const face = (points: Vec3[], value: number): void => {
    let normal = norm(cross(sub(points[1]!, points[0]!), sub(points[2]!, points[0]!)));
    if (dot(normal, points[0]!) < 0) { points.reverse(); normal = mul(normal, -1); }
    const center = mul(points.reduce(add, [0, 0, 0]), 1 / points.length);
    const up = sides === 6 ? norm(sub(points[3]!, points[0]!)) : norm(sub(points[2]!, center));
    const right = norm(cross(up, normal));
    faces.push({ value, normal, up });
    const indices = points.length === 4 ? [0, 1, 2, 0, 2, 3] : [0, 1, 2];
    indices.forEach((index, i) => {
      const p = points[index]!, rel = sub(p, center);
      const scale = sides === 6 ? 1.5 : 0.72;
      data.push(...p, ...normal, 0.5 + dot(rel, right) / scale, 0.5 - dot(rel, up) / scale, value,
        i % 3 === 0 ? 1 : 0, i % 3 === 1 ? 1 : 0, i % 3 === 2 ? 1 : 0);
    });
  };
  if (sides === 6) {
    for (const [normal, up, value] of [
      [[0,0,1],[0,1,0],1], [[0,0,-1],[0,1,0],6], [[1,0,0],[0,1,0],2],
      [[-1,0,0],[0,1,0],5], [[0,1,0],[0,0,-1],3], [[0,-1,0],[0,0,1],4],
    ] as [Vec3, Vec3, number][]) {
      const right = cross(up, normal), center = mul(normal, 0.75);
      face([[-1,-1],[1,-1],[1,1],[-1,1]].map(([x,y]) => add(center, add(mul(right, x! * 0.75), mul(up, y! * 0.75)))), value);
    }
  } else {
    const t = (1 + Math.sqrt(5)) / 2;
    const vertices: Vec3[] = [[-1,t,0],[1,t,0],[-1,-t,0],[1,-t,0],[0,-1,t],[0,1,t],[0,-1,-t],[0,1,-t],[t,0,-1],[t,0,1],[-t,0,-1],[-t,0,1]].map(v => norm(v as Vec3));
    [[0,11,5],[0,5,1],[0,1,7],[0,7,10],[0,10,11],[1,5,9],[5,11,4],[11,10,2],[10,7,6],[7,1,8],
      [3,9,4],[3,4,2],[3,2,6],[3,6,8],[3,8,9],[4,9,5],[2,4,11],[6,2,10],[8,6,7],[9,8,1]].forEach((f, i) => face(f.map(n => vertices[n]!), i + 1));
  }
  return { vertices: new Float32Array(data), faces };
}

/** Orient the reported face toward the viewer, with its numeral upright. */
export function faceOrientation(mesh: DiceMesh, value: number): Quat {
  const face = mesh.faces.find(f => f.value === value);
  if (!face) throw new Error(`No face ${value}`);
  const n = face.normal;
  let q: Quat = n[2] < -0.999 ? [1,0,0,0] : [n[1],-n[0],0,1+n[2]];
  const length = Math.hypot(...q); q = q.map(v => v / length) as Quat;
  const up = rotateBy(q, face.up);
  const angle = Math.atan2(up[0], up[1]) / 2;
  return quatMultiply([0,0,Math.sin(angle),Math.cos(angle)], q);
}
