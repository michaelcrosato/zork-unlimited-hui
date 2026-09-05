import type { OverworldManifest } from "@zork/world/overworld.js";
import type { OverworldView } from "@zork/world/session_view.js";
import type { WorldEdge, WorldNode } from "../../scene.ts";

/** The whole road graph with the player's knowledge painted on it. */
export function buildWorldGraph(manifest: OverworldManifest, view: OverworldView): { nodes: WorldNode[]; edges: WorldEdge[] } {
  const discovered = new Set(view.discovered.map((node) => node.id));
  const visited = new Set<string>([view.current.id]);
  for (const entry of view.log) {
    visited.add(entry.fromId);
    visited.add(entry.toId);
  }
  const nodes: WorldNode[] = manifest.nodes.map((node) => ({
    id: node.id,
    name: node.name,
    lat: node.lat,
    lon: node.lon,
    region: node.region,
    kind: node.kind,
    visited: visited.has(node.id),
    discovered: discovered.has(node.id) || visited.has(node.id),
    current: node.id === view.current.id,
  }));
  const known = new Set(nodes.filter((node) => node.discovered).map((node) => node.id));
  const edges: WorldEdge[] = manifest.edges.map((edge) => ({
    id: edge.id,
    from: edge.from,
    to: edge.to,
    route: edge.route,
    minutes: edge.travel_minutes,
    miles: edge.distance_mi,
    known: known.has(edge.from) && known.has(edge.to),
  }));
  return { nodes, edges };
}
