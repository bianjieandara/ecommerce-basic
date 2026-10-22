// Splits lists into groups. Used to keep one D1 batch, or one IN list, under D1's limits on statements and bound parameters.

/**
 * Splits a list into consecutive groups of at most `size` items.
 * @param items Items in order.
 * @param size Largest group size (at least 1).
 * @returns The groups, in order. An empty list gives no groups.
 */
export function chunk<T>(items: readonly T[], size: number): T[][] {
  const groups: T[][] = [];
  for (let start = 0; start < items.length; start += size) {
    groups.push(items.slice(start, start + size));
  }
  return groups;
}
