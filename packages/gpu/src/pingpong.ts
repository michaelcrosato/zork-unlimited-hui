/** Two textures that trade places every frame, for feedback effects. */
export class PingPong {
  private textures: [GPUTexture, GPUTexture];
  private views: [GPUTextureView, GPUTextureView];
  private index = 0;

  constructor(
    private readonly device: GPUDevice,
    readonly format: GPUTextureFormat,
    width: number,
    height: number,
    private readonly label = "pingpong",
  ) {
    [this.textures, this.views] = this.allocate(width, height);
  }

  private allocate(width: number, height: number): [[GPUTexture, GPUTexture], [GPUTextureView, GPUTextureView]] {
    const make = (i: number) =>
      this.device.createTexture({
        label: `${this.label} ${i}`,
        size: { width: Math.max(1, width), height: Math.max(1, height) },
        format: this.format,
        usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_SRC,
      });
    const textures: [GPUTexture, GPUTexture] = [make(0), make(1)];
    return [textures, [textures[0].createView(), textures[1].createView()]];
  }

  get read(): GPUTexture {
    return this.textures[this.index]!;
  }

  get write(): GPUTexture {
    return this.textures[1 - this.index]!;
  }

  readView(): GPUTextureView {
    return this.views[this.index]!;
  }

  writeView(): GPUTextureView {
    return this.views[1 - this.index]!;
  }

  swap(): void {
    this.index = 1 - this.index;
  }

  get width(): number {
    return this.textures[0]!.width;
  }

  get height(): number {
    return this.textures[0]!.height;
  }

  resize(width: number, height: number): boolean {
    if (width === this.width && height === this.height) return false;
    for (const texture of this.textures) texture.destroy();
    [this.textures, this.views] = this.allocate(width, height);
    return true;
  }

  destroy(): void {
    for (const texture of this.textures) texture.destroy();
  }
}
