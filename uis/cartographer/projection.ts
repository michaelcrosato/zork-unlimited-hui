export interface Projected {
  id: string;
  x: number;
  z: number;
}

/**
 * Equirectangular projection of lat/lon onto the map plane: east is +x,
 * north is -z (into the screen for a camera looking north), scaled so the
 * larger span of the node set fits `extent` units, centred on the origin.
 */
export function projectNodes(
  nodes: readonly { id: string; lat: number; lon: number }[],
  extent: number,
): { points: Projected[]; scale: number; center: { lat: number; lon: number } } {
  if (nodes.length === 0) return { points: [], scale: 1, center: { lat: 0, lon: 0 } };
  const lats = nodes.map((n) => n.lat);
  const lons = nodes.map((n) => n.lon);
  const center = { lat: (Math.min(...lats) + Math.max(...lats)) / 2, lon: (Math.min(...lons) + Math.max(...lons)) / 2 };
  const cosLat = Math.cos((center.lat * Math.PI) / 180);
  const spanX = (Math.max(...lons) - Math.min(...lons)) * cosLat;
  const spanZ = Math.max(...lats) - Math.min(...lats);
  const span = Math.max(spanX, spanZ);
  const scale = span > 0 ? extent / span : 1;
  const points = nodes.map((n) => ({
    id: n.id,
    x: (n.lon - center.lon) * cosLat * scale + 0,
    z: -(n.lat - center.lat) * scale + 0,
  }));
  return { points, scale, center };
}
