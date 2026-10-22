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
