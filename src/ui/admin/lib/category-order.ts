// Display order of a category tree: depth first, siblings by position. The category manager and the option lists of the
// product editor both use it, so the tree is ordered in one place.

/** Anything that sits in a tree: an id, a parent and a position among its siblings. */
export interface TreeNode {
  id: string;
  parentId: string | null;
  position: number;
}

/**
 * Items in display order with their depth. An item whose parent is missing is shown at the top level, so no item is lost.
 * @param items All items.
 * @returns Each item with its depth.
 */
export function orderTree<T extends TreeNode>(items: T[]): { item: T; depth: number }[] {
  const known = new Set(items.map((item) => item.id));
  const childrenOf = (parent: string | null): T[] =>
    items
      .filter((item) =>
        parent === null ? item.parentId === null || !known.has(item.parentId) : item.parentId === parent,
      )
      .sort((a, b) => a.position - b.position);
  const result: { item: T; depth: number }[] = [];
  const visit = (parent: string | null, depth: number) => {
    for (const item of childrenOf(parent)) {
      result.push({ item, depth });
      visit(item.id, depth + 1);
    }
  };
  visit(null, 0);
  return result;
}

/**
 * The full order that results from swapping an item with its neighbour among its siblings.
 * @param items All items.
 * @param id Item to move.
 * @param step -1 to move up, 1 to move down.
 * @returns Ids in the new display order, or null when the item cannot move that way.
 */
export function swappedOrder<T extends TreeNode>(items: T[], id: string, step: -1 | 1): string[] | null {
  const item = items.find((candidate) => candidate.id === id);
  if (!item) return null;
  const siblings = items
    .filter((candidate) => candidate.parentId === item.parentId)
    .sort((a, b) => a.position - b.position);
  const other = siblings[siblings.findIndex((candidate) => candidate.id === id) + step];
  if (!other) return null;
  const positions = new Map(items.map((candidate) => [candidate.id, candidate.position] as const));
  positions.set(item.id, other.position);
  positions.set(other.id, item.position);
  const reordered = items.map((candidate) => ({ ...candidate, position: positions.get(candidate.id) ?? 0 }));
  return orderTree(reordered).map((entry) => entry.item.id);
}
