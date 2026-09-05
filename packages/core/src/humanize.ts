/**
 * Turn an engine identifier such as `relief_spear` or `albany:road_warden`
 * into a player-facing phrase. Text that already reads as prose (it contains
 * whitespace) is returned untouched so authored titles are never mangled.
 */
export function humanizeId(id: string): string {
  if (id.length === 0) return id;
  if (/\s/.test(id)) return id;
  const local = id.includes(":") ? id.slice(id.lastIndexOf(":") + 1) : id;
  const words = local.split(/[_-]+/).filter((word) => word.length > 0);
  if (words.length === 0) return id;
  const sentence = words.join(" ").toLowerCase();
  return sentence.charAt(0).toUpperCase() + sentence.slice(1);
}
