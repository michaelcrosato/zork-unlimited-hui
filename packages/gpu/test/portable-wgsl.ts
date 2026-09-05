import { Assign, Node, StringExpr, WgslParser } from "wgsl_reflect";

/**
 * Conservative portability rule: reserve component-like member names for vector
 * access, and write whole vectors or single components. Parsing alone accepts
 * multi-component lvalues even when a browser lacks swizzle_assignment.
 */
export function swizzleWrites(source: string): { line: number; member: string }[] {
  const writes: { line: number; member: string }[] = [];
  const seen = new Set<Node>();
  const visit = (node: unknown): void => {
    if (Array.isArray(node)) { node.forEach(visit); return; }
    if (!(node instanceof Node) || seen.has(node)) return;
    seen.add(node);
    if (node instanceof Assign) {
      let member = node.variable.postfix;
      while (member?.postfix) member = member.postfix;
      if (member instanceof StringExpr && /^(?:[xyzw]{2,4}|[rgba]{2,4})$/.test(member.value)) {
        writes.push({ line: node.line, member: member.value });
      }
    }
    // Node.search() skips assignment statements, so walk the AST fields directly.
    Object.values(node).forEach(visit);
  };
  visit(new WgslParser().parse(source));
  return writes;
}
