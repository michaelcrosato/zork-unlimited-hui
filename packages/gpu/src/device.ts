export interface GpuSize {
  /** Backing-store size in device pixels. */
  width: number;
  height: number;
  /** CSS pixel size. */
  cssWidth: number;
  cssHeight: number;
  dpr: number;
}

export interface Gpu {
  readonly adapter: GPUAdapter;
  readonly device: GPUDevice;
  readonly context: GPUCanvasContext;
  readonly format: GPUTextureFormat;
  readonly canvas: HTMLCanvasElement;
  size(): GpuSize;
  onResize(callback: (size: GpuSize) => void): () => void;
  /** The swapchain texture for the frame being encoded. */
  currentTexture(): GPUTexture;
  destroy(): void;
}

export interface CreateGpuOptions {
  powerPreference?: GPUPowerPreference;
  alphaMode?: GPUCanvasAlphaMode;
  /** Cap on the backing-store scale; 4K at 2x is still fine on a 4070 Super. */
  maxDpr?: number;
}

/**
 * Request an adapter and device, configure the canvas, and keep the backing
 * store in step with the element's CSS size and device pixel ratio.
 */
export async function createGpu(canvas: HTMLCanvasElement, options: CreateGpuOptions = {}): Promise<Gpu> {
  if (!("gpu" in navigator) || !navigator.gpu) {
    throw new Error("WebGPU is not available in this browser. Use a current Chrome or Edge.");
  }
  const adapter = await navigator.gpu.requestAdapter({ powerPreference: options.powerPreference ?? "high-performance" });
  if (!adapter) throw new Error("WebGPU is available but no adapter was returned. Check chrome://gpu.");
  const device = await adapter.requestDevice({ label: "hui" });
  device.lost.then((info) => {
    if (info.reason !== "destroyed") console.error(`WebGPU device lost: ${info.message}`);
  });
  const context = canvas.getContext("webgpu");
  if (!context) throw new Error("The canvas could not provide a WebGPU context.");
  const format = navigator.gpu.getPreferredCanvasFormat();
  context.configure({
    device,
    format,
    alphaMode: options.alphaMode ?? "opaque",
    usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC | GPUTextureUsage.TEXTURE_BINDING,
  });

  const listeners = new Set<(size: GpuSize) => void>();
  const maxDpr = options.maxDpr ?? 2;
  const maxDim = device.limits.maxTextureDimension2D;
  let current: GpuSize = { width: 1, height: 1, cssWidth: 1, cssHeight: 1, dpr: 1 };

  const apply = (): void => {
    const dpr = Math.min(window.devicePixelRatio || 1, maxDpr);
    const cssWidth = Math.max(1, canvas.clientWidth || canvas.width);
    const cssHeight = Math.max(1, canvas.clientHeight || canvas.height);
    const width = Math.min(maxDim, Math.max(1, Math.round(cssWidth * dpr)));
    const height = Math.min(maxDim, Math.max(1, Math.round(cssHeight * dpr)));
    if (width === current.width && height === current.height && dpr === current.dpr) return;
    canvas.width = width;
    canvas.height = height;
    current = { width, height, cssWidth, cssHeight, dpr };
    for (const listener of [...listeners]) listener(current);
  };
  apply();
  const observer = typeof ResizeObserver === "function" ? new ResizeObserver(() => apply()) : null;
  observer?.observe(canvas);

  return {
    adapter,
    device,
    context,
    format,
    canvas,
    size: () => current,
    onResize(callback) {
      listeners.add(callback);
      return () => {
        listeners.delete(callback);
      };
    },
    currentTexture: () => context.getCurrentTexture(),
    destroy() {
      observer?.disconnect();
      listeners.clear();
      context.unconfigure();
      device.destroy();
    },
  };
}
