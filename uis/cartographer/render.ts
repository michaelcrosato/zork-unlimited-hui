import type { Scene, WorldEdge, WorldNode } from "@hui/core";
import {
  ALPHA_BLEND,
  FullscreenPass,
  ParticleSystem,
  PREMULTIPLIED_OVER,
  TextAtlas,
  TextRenderer,
  UniformBuffer,
  WGSL_LIBS,
  layoutText,
  preprocessWgsl,
  type GlyphStyle,
} from "@hui/gpu";
import { blockAt, composePage, type BlockKind, type Ink, type PageModel, type UiContext, type UiInstance } from "@hui/shell";
import { cameraPosition, clipW, flyTo, multiply, perspective, transformPoint, viewMatrix, type CameraState, type Vec3 } from "./camera.ts";
import { paintFog } from "./fog.ts";
import { projectNodes, type Projected } from "./projection.ts";
import frameWgsl from "./wgsl/lib/frame.wgsl?raw";
import terrainComputeWgsl from "./wgsl/terrain-compute.wgsl?raw";
import terrainWgsl from "./wgsl/terrain.wgsl?raw";
import roadsWgsl from "./wgsl/roads.wgsl?raw";
import pinsWgsl from "./wgsl/pins.wgsl?raw";
import skyWgsl from "./wgsl/sky.wgsl?raw";
import panelShadeWgsl from "./wgsl/panel-shade.wgsl?raw";

const EXTENT = 200;
const HEIGHT_TEXELS = 512;
const GRID = 256;
const FOG_TEXELS = 256;
const SAMPLES = 4;
const DEPTH_FORMAT: GPUTextureFormat = "depth24plus";
const WATER_LEVEL = -0.8;
const ROAD_SEGMENTS = 10;
const FAMILY = '"Segoe UI", "Helvetica Neue", Arial, system-ui, sans-serif';
const LIBS = { ...WGSL_LIBS, "cartographer/frame": frameWgsl };

type Rgba = [number, number, number, number];

const PANEL_INKS: Record<BlockKind, Rgba> = {
  kicker: [0.45, 0.8, 0.89, 1],
  title: [0.94, 0.92, 0.87, 1],
  vitals: [0.62, 0.66, 0.68, 1],
  ending: [0.95, 0.6, 0.3, 1],
  prose: [0.85, 0.84, 0.8, 1],
  dialogue: [0.8, 0.76, 0.66, 1],
  result: [0.9, 0.78, 0.5, 1],
  pressure: [0.85, 0.6, 0.35, 1],
  choice: [0.95, 0.58, 0.18, 1],
  terms: [0.6, 0.64, 0.66, 1],
  note: [0.5, 0.55, 0.58, 1],
};
const PANEL_HOVER: Rgba = [1, 0.85, 0.45, 1];
const PANEL_DISABLED: Rgba = [0.45, 0.45, 0.45, 0.8];

function hourOf(time: string): number {
  const match = /(\d{1,2}):(\d{2})/.exec(time);
  return match ? Number(match[1]) + Number(match[2]) / 60 : 12;
}

export async function renderCartographer(ctx: UiContext): Promise<UiInstance> {
  const { gpu, client, canvas } = ctx;
  const { device, format } = gpu;

  // ---- text ---------------------------------------------------------------------
  const atlases: Record<Ink, TextAtlas> = {
    body: new TextAtlas(device, { family: FAMILY, px: 48, padding: 8 }),
    display: new TextAtlas(device, { family: FAMILY, px: 48, padding: 8, weight: "700" }),
    italic: new TextAtlas(device, { family: FAMILY, px: 48, padding: 8, style: "italic" }),
  };
  const text: Record<Ink, TextRenderer> = {
    body: new TextRenderer(gpu, atlases.body, { capacity: 10000 }),
    display: new TextRenderer(gpu, atlases.display, { capacity: 6000 }),
    italic: new TextRenderer(gpu, atlases.italic, { capacity: 3000 }),
  };
  const measures = {
    body: (ch: string, size: number) => atlases.body.measure(ch, size),
    display: (ch: string, size: number) => atlases.display.measure(ch, size),
    italic: (ch: string, size: number) => atlases.italic.measure(ch, size),
  };

  // ---- shared frame uniforms and textures ------------------------------------------
  const frame = new UniformBuffer(device, 128, "frame");
  const heightTex = device.createTexture({
    label: "height field",
    size: { width: HEIGHT_TEXELS, height: HEIGHT_TEXELS },
    format: "r32float",
    usage: GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.TEXTURE_BINDING,
  });
  const fogTex = device.createTexture({
    label: "fog of war",
    size: { width: FOG_TEXELS, height: FOG_TEXELS },
    format: "r8unorm",
    usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
  });
  const fogSampler = device.createSampler({ magFilter: "linear", minFilter: "linear", addressModeU: "clamp-to-edge", addressModeV: "clamp-to-edge" });
  const heightView = heightTex.createView();
  const fogView = fogTex.createView();

  // ---- pipelines ------------------------------------------------------------------------
  const terrainModule = device.createShaderModule({ label: "terrain", code: preprocessWgsl(terrainWgsl, LIBS) });
  const terrainPipeline = device.createRenderPipeline({
    label: "terrain",
    layout: "auto",
    vertex: { module: terrainModule, entryPoint: "vs" },
    fragment: { module: terrainModule, entryPoint: "fs", targets: [{ format }] },
    primitive: { topology: "triangle-list", cullMode: "back" },
    depthStencil: { format: DEPTH_FORMAT, depthWriteEnabled: true, depthCompare: "less" },
    multisample: { count: SAMPLES },
  });
  const roadsModule = device.createShaderModule({ label: "roads", code: preprocessWgsl(roadsWgsl, LIBS) });
  const roadsPipeline = device.createRenderPipeline({
    label: "roads",
    layout: "auto",
    vertex: {
      module: roadsModule,
      entryPoint: "vs",
      buffers: [
        {
          arrayStride: 32,
          stepMode: "instance",
          attributes: [
            { shaderLocation: 0, offset: 0, format: "float32x2" },
            { shaderLocation: 1, offset: 8, format: "float32x2" },
            { shaderLocation: 2, offset: 16, format: "float32x4" },
          ],
        },
      ],
    },
    fragment: { module: roadsModule, entryPoint: "fs", targets: [{ format, blend: ALPHA_BLEND }] },
    primitive: { topology: "triangle-list" },
    depthStencil: { format: DEPTH_FORMAT, depthWriteEnabled: false, depthCompare: "less-equal" },
    multisample: { count: SAMPLES },
  });
  const pinsModule = device.createShaderModule({ label: "pins", code: preprocessWgsl(pinsWgsl, LIBS) });
  const pinsPipeline = device.createRenderPipeline({
    label: "pins",
    layout: "auto",
    vertex: {
      module: pinsModule,
      entryPoint: "vs",
      buffers: [
        {
          arrayStride: 32,
          stepMode: "instance",
          attributes: [
            { shaderLocation: 0, offset: 0, format: "float32x4" },
            { shaderLocation: 1, offset: 16, format: "float32x4" },
          ],
        },
      ],
    },
    fragment: { module: pinsModule, entryPoint: "fs", targets: [{ format }] },
    primitive: { topology: "triangle-list", cullMode: "none" },
    depthStencil: { format: DEPTH_FORMAT, depthWriteEnabled: true, depthCompare: "less" },
    multisample: { count: SAMPLES },
  });
  // With layout "auto" a pipeline's layout only holds the bindings its shaders
  // actually reference, so each bind group lists exactly those.
  const frameEntries: GPUBindGroupEntry[] = [
    { binding: 0, resource: { buffer: frame.buffer } },
    { binding: 1, resource: heightView },
    { binding: 2, resource: fogView },
    { binding: 3, resource: fogSampler },
  ];
  const bindGroupFor = (pipeline: GPURenderPipeline, bindings: number[]): GPUBindGroup =>
    device.createBindGroup({
      layout: pipeline.getBindGroupLayout(0),
      entries: frameEntries.filter((entry) => bindings.includes(entry.binding)),
    });
  const terrainBind = bindGroupFor(terrainPipeline, [0, 1, 2, 3]);
  const roadsBind = bindGroupFor(roadsPipeline, [0, 1, 2, 3]);
  const pinsBind = bindGroupFor(pinsPipeline, [0, 1]);

  const sky = new FullscreenPass(gpu, {
    code: preprocessWgsl(skyWgsl, LIBS),
    uniformBytes: 32,
    label: "sky",
    sampleCount: SAMPLES,
    depthFormat: DEPTH_FORMAT,
  });
  const panelShade = new FullscreenPass(gpu, { code: preprocessWgsl(panelShadeWgsl, LIBS), uniformBytes: 32, label: "panel shade", blend: ALPHA_BLEND });
  const snow = new ParticleSystem(gpu, 40_000, { blend: PREMULTIPLIED_OVER, label: "map snow" });

  // ---- terrain grid indices ------------------------------------------------------------------
  const indices = new Uint32Array(GRID * GRID * 6);
  let k = 0;
  for (let z = 0; z < GRID; z++) {
    for (let x = 0; x < GRID; x++) {
      const a = z * (GRID + 1) + x;
      const b = a + 1;
      const c = a + GRID + 1;
      const d = c + 1;
      indices[k++] = a;
      indices[k++] = c;
      indices[k++] = b;
      indices[k++] = b;
      indices[k++] = c;
      indices[k++] = d;
    }
  }
  const indexBuffer = device.createBuffer({ label: "terrain indices", size: indices.byteLength, usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST });
  device.queue.writeBuffer(indexBuffer, 0, indices);

  // ---- world model ------------------------------------------------------------------------------
  let scene: Scene = client.scene();
  let nodes: WorldNode[] = scene.world?.nodes ?? [];
  let edges: WorldEdge[] = scene.world?.edges ?? [];
  let points = new Map<string, Projected>();
  let terrainReady = false;
  let fogKey = "";
  let roadKey = "";
  let roadBuffer: GPUBuffer | null = null;
  let roadCount = 0;
  let pinBuffer: GPUBuffer | null = null;
  let pinCount = 0;
  let currentId: string | null = null;

  const buildTerrain = (): void => {
    if (terrainReady || nodes.length === 0) return;
    const projected = projectNodes(nodes, EXTENT * 0.86).points;
    points = new Map(projected.map((p) => [p.id, p]));
    const nodeData = new Float32Array(Math.max(1, projected.length) * 2);
    projected.forEach((p, i) => {
      nodeData[i * 2] = p.x;
      nodeData[i * 2 + 1] = p.z;
    });
    const nodeBuffer = device.createBuffer({ label: "town positions", size: nodeData.byteLength, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });
    device.queue.writeBuffer(nodeBuffer, 0, nodeData);
    const params = new UniformBuffer(device, 16, "terrain params");
    params.set(0, [EXTENT, HEIGHT_TEXELS, projected.length, 17.3]).upload();
    const module = device.createShaderModule({ label: "terrain compute", code: preprocessWgsl(terrainComputeWgsl, LIBS) });
    const pipeline = device.createComputePipeline({ label: "terrain compute", layout: "auto", compute: { module, entryPoint: "main" } });
    const bind = device.createBindGroup({
      layout: pipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: params.buffer } },
        { binding: 1, resource: { buffer: nodeBuffer } },
        { binding: 2, resource: heightView },
      ],
    });
    const encoder = device.createCommandEncoder({ label: "terrain compute" });
    const pass = encoder.beginComputePass();
    pass.setPipeline(pipeline);
    pass.setBindGroup(0, bind);
    pass.dispatchWorkgroups(Math.ceil(HEIGHT_TEXELS / 16), Math.ceil(HEIGHT_TEXELS / 16));
    pass.end();
    device.queue.submit([encoder.finish()]);
    terrainReady = true;
  };

  const updateFog = (): void => {
    const key = nodes.map((n) => (n.visited ? "v" : n.discovered ? "d" : "-")).join("");
    if (key === fogKey) return;
    fogKey = key;
    const knowledge = new Map(nodes.map((n) => [n.id, { visited: n.visited, discovered: n.discovered }]));
    const fog = paintFog(FOG_TEXELS, EXTENT, [...points.values()], knowledge, { visitedRadius: 24, discoveredRadius: 13 });
    device.queue.writeTexture({ texture: fogTex }, fog, { bytesPerRow: FOG_TEXELS }, { width: FOG_TEXELS, height: FOG_TEXELS });
  };

  const updateRoads = (): void => {
    const current = nodes.find((n) => n.current)?.id ?? "";
    const key = edges.map((e) => (e.known ? "k" : "-")).join("") + current;
    if (key === roadKey) return;
    roadKey = key;
    const known = edges.filter((e) => e.known && points.has(e.from) && points.has(e.to));
    const data = new Float32Array(Math.max(1, known.length * ROAD_SEGMENTS) * 8);
    let i = 0;
    for (const edge of known) {
      const a = points.get(edge.from)!;
      const b = points.get(edge.to)!;
      const highlight = edge.from === current || edge.to === current ? 1 : 0;
      for (let s = 0; s < ROAD_SEGMENTS; s++) {
        const t0 = s / ROAD_SEGMENTS;
        const t1 = (s + 1) / ROAD_SEGMENTS;
        data.set([a.x + (b.x - a.x) * t0, a.z + (b.z - a.z) * t0, a.x + (b.x - a.x) * t1, a.z + (b.z - a.z) * t1, 0.9, 1, highlight, 0], i * 8);
        i++;
      }
    }
    roadCount = i;
    roadBuffer?.destroy();
    roadBuffer = device.createBuffer({ label: "road segments", size: data.byteLength, usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST });
    device.queue.writeBuffer(roadBuffer, 0, data);
  };

  const updatePins = (): void => {
    const shown = nodes.filter((n) => n.discovered && points.has(n.id));
    const data = new Float32Array(Math.max(1, shown.length) * 8);
    shown.forEach((n, i) => {
      const p = points.get(n.id)!;
      const kind = n.current ? 2 : n.visited ? 1 : 0;
      const big = /metropolis|large/.test(n.kind) ? 1.35 : /major|city/.test(n.kind) ? 1.1 : 0.85;
      const colour: Rgba = n.current ? [1, 0.6, 0.2, 1] : n.visited ? [0.93, 0.9, 0.82, 1] : [0.5, 0.66, 0.74, 1];
      data.set([p.x, p.z, big, kind, ...colour], i * 8);
    });
    pinCount = shown.length;
    pinBuffer?.destroy();
    pinBuffer = device.createBuffer({ label: "pins", size: data.byteLength, usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST });
    device.queue.writeBuffer(pinBuffer, 0, data);
  };

  // ---- camera -------------------------------------------------------------------------------------
  let camera: CameraState = { target: [0, 1.5, 0], distance: 70, yaw: 0.5, pitch: 0.78 };
  let flight: { from: CameraState; to: CameraState; start: number; duration: number } | null = null;
  let now = 0;
  const flyToNode = (id: string, distance?: number): void => {
    const p = points.get(id);
    if (!p) return;
    const to: CameraState = { ...camera, target: [p.x, 1.5, p.z], distance: distance ?? Math.min(camera.distance, 60) };
    flight = { from: camera, to, start: now, duration: 1.6 };
  };
  let dragging = false;
  let last = { x: 0, y: 0 };
  canvas.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return;
    dragging = true;
    last = { x: event.clientX, y: event.clientY };
  });
  window.addEventListener("pointerup", () => {
    dragging = false;
  });
  canvas.addEventListener("pointermove", (event) => {
    if (!dragging) return;
    const dx = event.clientX - last.x;
    const dy = event.clientY - last.y;
    last = { x: event.clientX, y: event.clientY };
    if (Math.hypot(dx, dy) < 1) return;
    flight = null;
    camera = { ...camera, yaw: camera.yaw - dx * 0.006, pitch: Math.min(1.45, Math.max(0.2, camera.pitch + dy * 0.005)) };
  });
  canvas.addEventListener(
    "wheel",
    (event) => {
      flight = null;
      camera = { ...camera, distance: Math.min(320, Math.max(14, camera.distance * (1 + Math.sign(event.deltaY) * 0.12))) };
      event.preventDefault();
    },
    { passive: false },
  );

  // ---- targets ------------------------------------------------------------------------------------
  let msaa: GPUTexture | null = null;
  let depth: GPUTexture | null = null;
  const ensureTargets = (): { colour: GPUTextureView; depth: GPUTextureView } => {
    const { width, height } = gpu.size();
    if (!msaa || msaa.width !== width || msaa.height !== height) {
      msaa?.destroy();
      depth?.destroy();
      msaa = device.createTexture({ label: "msaa colour", size: { width, height }, sampleCount: SAMPLES, format, usage: GPUTextureUsage.RENDER_ATTACHMENT });
      depth = device.createTexture({ label: "depth", size: { width, height }, sampleCount: SAMPLES, format: DEPTH_FORMAT, usage: GPUTextureUsage.RENDER_ATTACHMENT });
    }
    return { colour: msaa.createView(), depth: depth!.createView() };
  };

  // ---- panel --------------------------------------------------------------------------------------
  let page: PageModel | null = null;
  let panel = { x: 0, width: 0, top: 56, scroll: 0, viewportW: 0, viewportH: 0 };
  let hovered: string | null = null;
  let revealStart = 0;
  const composePanel = (): void => {
    const { cssWidth, cssHeight } = gpu.size();
    const wide = cssWidth >= 980;
    const width = wide ? Math.min(460, Math.max(320, cssWidth * 0.3)) : cssWidth - 48;
    const x = wide ? cssWidth - width - 28 : 24;
    const top = wide ? 60 : Math.round(cssHeight * 0.5);
    panel = { ...panel, x, width, top, viewportW: cssWidth, viewportH: cssHeight };
    page = composePage(scene, { width: cssWidth, height: cssHeight }, measures.body, measures, {
      column: { x, width },
      top,
      typeScale: 0.82,
      notes: false,
    });
    for (const block of page.blocks) atlases[block.ink].ensure(block.text);
  };
  canvas.addEventListener("wheel", (event) => {
    if (!page) return;
    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    if (x >= panel.x - 20) {
      panel.scroll = Math.max(0, Math.min(Math.max(0, page.height - panel.viewportH), panel.scroll + event.deltaY));
    }
  });

  const applyScene = (next: Scene): void => {
    scene = next;
    if (next.world) {
      nodes = next.world.nodes;
      edges = next.world.edges;
    }
    buildTerrain();
    updateFog();
    updateRoads();
    updatePins();
    const current = nodes.find((n) => n.current)?.id ?? null;
    if (current && current !== currentId) {
      const first = currentId === null;
      currentId = current;
      if (first) {
        const p = points.get(current);
        if (p) camera = { ...camera, target: [p.x, 1.5, p.z] };
      } else {
        flyToNode(current);
      }
    }
    revealStart = now;
    panel.scroll = 0;
    hovered = null;
    composePanel();
  };
  applyScene(scene);

  // ---- helpers ------------------------------------------------------------------------------------
  const screenOf = (viewProj: Float32Array, world: Vec3, w: number, h: number): { x: number; y: number; depth: number } | null => {
    if (clipW(viewProj, world) <= 0.05) return null;
    const ndc = transformPoint(viewProj, world);
    if (Math.abs(ndc[0]) > 1.15 || Math.abs(ndc[1]) > 1.15) return null;
    return { x: ((ndc[0] + 1) / 2) * w, y: ((1 - ndc[1]) / 2) * h, depth: ndc[2] };
  };
  let lastViewProj: Float32Array = new Float32Array(16);
  const pinAt = (x: number, y: number): WorldNode | null => {
    const { cssWidth, cssHeight } = gpu.size();
    let best: { node: WorldNode; d: number } | null = null;
    for (const node of nodes) {
      if (!node.discovered) continue;
      const p = points.get(node.id);
      if (!p) continue;
      const s = screenOf(lastViewProj, [p.x, 3.5, p.z], cssWidth, cssHeight);
      if (!s) continue;
      const d = Math.hypot(s.x - x, s.y - y);
      if (d < 18 && (!best || d < best.d)) best = { node, d };
    }
    return best?.node ?? null;
  };
  const travelActionTo = (node: WorldNode): string | null => {
    const action = scene.actions.find((a) => a.kind === "travel" && !a.disabledReason && a.label.toLowerCase().includes(node.name.toLowerCase()));
    return action?.id ?? null;
  };

  return {
    onScene: applyScene,
    frame(dt, time) {
      now = time;
      const size = gpu.size();
      if (!page || size.cssWidth !== panel.viewportW || size.cssHeight !== panel.viewportH) composePanel();
      if (flight) {
        const t = (time - flight.start) / flight.duration;
        camera = flyTo(flight.from, flight.to, t);
        if (t >= 1) flight = null;
      }
      const aspect = size.width / size.height;
      const view = viewMatrix(camera);
      const proj = perspective(Math.PI / 3.6, aspect, 0.5, 900);
      const viewProj = multiply(proj, view);
      lastViewProj = viewProj;
      const eye = cameraPosition(camera);

      const hour = hourOf(scene.vitals.time);
      const elevation = Math.sin(((hour - 6) / 12) * Math.PI);
      const azimuth = (hour / 24) * Math.PI * 2;
      const sun: Vec3 = [Math.cos(azimuth) * Math.max(0.35, Math.cos(elevation)), Math.max(elevation, 0.08), Math.sin(azimuth) * Math.max(0.35, Math.cos(elevation))];
      const sunLen = Math.hypot(...sun);
      const nightness = Math.min(1, Math.max(0, -elevation * 2.2 + 0.05));
      frame.set(0, viewProj);
      frame.set(16, [sun[0] / sunLen, sun[1] / sunLen, sun[2] / sunLen, elevation]);
      frame.set(20, [eye[0], eye[1], eye[2], time]);
      frame.set(24, [EXTENT, nightness, 0.6, scene.danger]);
      frame.set(28, [WATER_LEVEL, HEIGHT_TEXELS, GRID, 0]);
      frame.upload();

      const targets = ensureTargets();
      const canvasView = gpu.currentTexture().createView();
      const encoder = device.createCommandEncoder({ label: "cartographer frame" });
      snow.update(encoder, [size.cssWidth, size.cssHeight], {
        dt,
        time,
        gravity: [0, 22],
        wind: [-14, 0],
        emitter: [-40, -60, size.cssWidth + 80, 30],
        color: [0.96, 0.97, 1, 0.5],
        size: 1.6,
        life: 14,
        turbulence: 40,
        mode: 0,
        density: 0.12 + scene.danger * 0.3,
        drag: 0.3,
        seed: 3,
      });

      const scenePass = encoder.beginRenderPass({
        label: "map",
        colorAttachments: [{ view: targets.colour, resolveTarget: canvasView, loadOp: "clear", clearValue: { r: 0, g: 0, b: 0, a: 1 }, storeOp: "discard" }],
        depthStencilAttachment: { view: targets.depth, depthLoadOp: "clear", depthClearValue: 1, depthStoreOp: "discard" },
      });
      const sunScreen = screenOf(viewProj, [eye[0] + sun[0] * 400, eye[1] + sun[1] * 400, eye[2] + sun[2] * 400], 1, 1);
      sky.uniforms.set(0, [size.cssWidth, size.cssHeight, time, nightness, sunScreen?.x ?? 0.5, sunScreen?.y ?? 0.2, elevation, 0]).upload();
      sky.draw(scenePass);
      if (terrainReady) {
        scenePass.setPipeline(terrainPipeline);
        scenePass.setBindGroup(0, terrainBind);
        scenePass.setIndexBuffer(indexBuffer, "uint32");
        scenePass.drawIndexed(indices.length);
        if (roadBuffer && roadCount > 0) {
          scenePass.setPipeline(roadsPipeline);
          scenePass.setBindGroup(0, roadsBind);
          scenePass.setVertexBuffer(0, roadBuffer);
          scenePass.draw(6, roadCount);
        }
        if (pinBuffer && pinCount > 0) {
          scenePass.setPipeline(pinsPipeline);
          scenePass.setBindGroup(0, pinsBind);
          scenePass.setVertexBuffer(0, pinBuffer);
          scenePass.draw(18, pinCount);
        }
      }
      scenePass.end();

      const overlay = encoder.beginRenderPass({
        label: "overlay",
        colorAttachments: [{ view: canvasView, loadOp: "load", storeOp: "store" }],
      });
      panelShade.uniforms.set(0, [size.cssWidth, size.cssHeight, panel.x, panel.top, 0.78, time, 0, 0]).upload();
      panelShade.draw(overlay);

      for (const renderer of Object.values(text)) renderer.begin();
      // Town labels: the current town first, then visited, then by distance; a
      // label that would overlap one already placed is dropped for this frame.
      const labelled = nodes
        .filter((n) => n.discovered && points.has(n.id))
        .map((n) => {
          const p = points.get(n.id)!;
          const rank = n.current ? 0 : n.visited ? 1 : 2;
          return { n, p, rank, d: Math.hypot(p.x - camera.target[0], p.z - camera.target[2]) };
        })
        .sort((a, b) => a.rank - b.rank || a.d - b.d)
        .slice(0, 80);
      const placed: { x0: number; y0: number; x1: number; y1: number }[] = [];
      for (const { n, p } of labelled) {
        const s = screenOf(viewProj, [p.x, 4.2 + (n.current ? 1.4 : 0), p.z], size.cssWidth, size.cssHeight);
        if (!s || s.x > panel.x - 10) continue;
        const dist = Math.hypot(eye[0] - p.x, eye[1] - 1.5, eye[2] - p.z);
        const px = Math.max(9, Math.min(20, 1100 / dist)) * (n.current ? 1.25 : 1);
        atlases.display.ensure(n.name);
        const layout = layoutText(n.name, { maxWidth: 400, size: px, lineHeight: px * 1.2, measure: measures.display });
        const rect = { x0: s.x - layout.width / 2 - 4, y0: s.y - px * 1.6 - 2, x1: s.x + layout.width / 2 + 4, y1: s.y - px * 1.6 + px * 1.2 + 2 };
        if (placed.some((r) => rect.x0 < r.x1 && rect.x1 > r.x0 && rect.y0 < r.y1 && rect.y1 > r.y0)) continue;
        placed.push(rect);
        const colour: Rgba = n.current ? [1, 0.72, 0.3, 1] : n.visited ? [0.98, 0.96, 0.9, 0.95] : [0.85, 0.92, 0.96, 0.9];
        text.display.pushText(layout, s.x - layout.width / 2, s.y - px * 1.6, px, { color: colour, softness: 0.1, weight: 0.04 });
      }
      if (page) {
        for (const block of page.blocks) {
          const isHovered = block.actionId !== undefined && block.actionId === hovered && !block.disabled;
          const color = block.disabled ? PANEL_DISABLED : isHovered ? PANEL_HOVER : PANEL_INKS[block.kind];
          const style: GlyphStyle = { color, t0: revealStart + Math.min(1.2, block.order * 0.05), softness: block.size > 24 ? 0.06 : 0.1, weight: isHovered ? 0.05 : 0.01 };
          text[block.ink].pushText(block.layout, block.x, block.y - panel.scroll, block.size, style);
        }
      }
      for (const renderer of Object.values(text)) renderer.flush(overlay, time, [size.cssWidth, size.cssHeight]);
      snow.draw(overlay);
      overlay.end();
      device.queue.submit([encoder.finish()]);
    },
    hit(x, y) {
      if (page && x >= panel.x - 20) {
        const block = blockAt(page, x, y + panel.scroll);
        return block && !block.disabled ? (block.actionId ?? null) : null;
      }
      const node = pinAt(x, y);
      if (node && !node.current) {
        const id = travelActionTo(node);
        if (id) return id;
        flyToNode(node.id, camera.distance);
        ctx.notice(`${node.name}: no direct road from here.`);
      }
      return null;
    },
    hover(x, y) {
      if (page && x >= panel.x - 20) {
        const block = blockAt(page, x, y + panel.scroll);
        hovered = block && !block.disabled ? (block.actionId ?? null) : null;
        return hovered !== null;
      }
      hovered = null;
      return pinAt(x, y) !== null;
    },
    destroy() {
      msaa?.destroy();
      depth?.destroy();
      roadBuffer?.destroy();
      pinBuffer?.destroy();
    },
  };
}
