export type Vec3 = [number, number, number];

export interface CameraState {
  target: Vec3;
  distance: number;
  /** Rotation around the up axis, radians. */
  yaw: number;
  /** Elevation above the target plane, radians (0 = level, π/2 = straight down). */
  pitch: number;
}

export function easeInOut(t: number): number {
  const s = Math.min(1, Math.max(0, t));
  return s * s * (3 - 2 * s);
}

const mix = (a: number, b: number, s: number): number => a * (1 - s) + b * s;

/** Interpolate two camera states with a smooth ease; exact at both ends. */
export function flyTo(from: CameraState, to: CameraState, t: number): CameraState {
  const s = easeInOut(t);
  return {
    target: [mix(from.target[0], to.target[0], s), mix(from.target[1], to.target[1], s), mix(from.target[2], to.target[2], s)],
    distance: mix(from.distance, to.distance, s),
    yaw: mix(from.yaw, to.yaw, s),
    pitch: mix(from.pitch, to.pitch, s),
  };
}

export function cameraPosition(state: CameraState): Vec3 {
  const cp = Math.cos(state.pitch);
  return [
    state.target[0] + state.distance * cp * Math.sin(state.yaw),
    state.target[1] + state.distance * Math.sin(state.pitch),
    state.target[2] + state.distance * cp * Math.cos(state.yaw),
  ];
}

function normalize(v: Vec3): Vec3 {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
}

function cross(a: Vec3, b: Vec3): Vec3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

const dot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/** Column-major right-handed look-at matrix (camera looks down -z). */
export function lookAt(eye: Vec3, target: Vec3, up: Vec3 = [0, 1, 0]): Float32Array {
  const f = normalize([target[0] - eye[0], target[1] - eye[1], target[2] - eye[2]]);
  const s = normalize(cross(f, up));
  const u = cross(s, f);
  return new Float32Array([s[0], u[0], -f[0], 0, s[1], u[1], -f[1], 0, s[2], u[2], -f[2], 0, -dot(s, eye), -dot(u, eye), dot(f, eye), 1]);
}

export function viewMatrix(state: CameraState): Float32Array {
  return lookAt(cameraPosition(state), state.target);
}

/** Column-major perspective matrix for WebGPU's 0..1 depth range. */
export function perspective(fovY: number, aspect: number, near: number, far: number): Float32Array {
  const f = 1 / Math.tan(fovY / 2);
  const m = new Float32Array(16);
  m[0] = f / aspect;
  m[5] = f;
  m[10] = far / (near - far);
  m[11] = -1;
  m[14] = (near * far) / (near - far);
  return m;
}

export function multiply(a: Float32Array, b: Float32Array): Float32Array {
  const out = new Float32Array(16);
  for (let col = 0; col < 4; col++) {
    for (let row = 0; row < 4; row++) {
      let sum = 0;
      for (let k = 0; k < 4; k++) sum += a[k * 4 + row]! * b[col * 4 + k]!;
      out[col * 4 + row] = sum;
    }
  }
  return out;
}

/** Transform a point by a column-major matrix, dividing by w. */
export function transformPoint(m: Float32Array, p: Vec3): Vec3 {
  const x = m[0]! * p[0] + m[4]! * p[1] + m[8]! * p[2] + m[12]!;
  const y = m[1]! * p[0] + m[5]! * p[1] + m[9]! * p[2] + m[13]!;
  const z = m[2]! * p[0] + m[6]! * p[1] + m[10]! * p[2] + m[14]!;
  const w = m[3]! * p[0] + m[7]! * p[1] + m[11]! * p[2] + m[15]!;
  return w !== 0 && w !== 1 ? [x / w, y / w, z / w] : [x, y, z];
}

/** Clip-space w of a point, to know whether it lies in front of the camera. */
export function clipW(m: Float32Array, p: Vec3): number {
  return m[3]! * p[0] + m[7]! * p[1] + m[11]! * p[2] + m[15]!;
}
