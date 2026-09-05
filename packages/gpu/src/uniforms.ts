/**
 * A uniform buffer with a CPU shadow. Callers write floats or uints at known
 * offsets (matching their WGSL struct layout) and call `upload` once a frame.
 */
export class UniformBuffer {
  readonly buffer: GPUBuffer;
  readonly bytes: ArrayBuffer;
  readonly f32: Float32Array;
  readonly u32: Uint32Array;
  readonly i32: Int32Array;

  constructor(
    private readonly device: GPUDevice,
    byteLength: number,
    label = "uniforms",
  ) {
    const size = Math.max(16, Math.ceil(byteLength / 16) * 16);
    this.bytes = new ArrayBuffer(size);
    this.f32 = new Float32Array(this.bytes);
    this.u32 = new Uint32Array(this.bytes);
    this.i32 = new Int32Array(this.bytes);
    this.buffer = device.createBuffer({
      label,
      size,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
  }

  /** Write consecutive floats starting at a float offset. */
  set(offsetFloats: number, values: ArrayLike<number>): this {
    this.f32.set(values, offsetFloats);
    return this;
  }

  setU32(offsetU32: number, value: number): this {
    this.u32[offsetU32] = value >>> 0;
    return this;
  }

  upload(): void {
    this.device.queue.writeBuffer(this.buffer, 0, this.bytes);
  }
}
