// Cart state in the browser. It stores what the customer picked and the prices they saw; the server re-prices the cart
// before any total is shown as final (see the quote endpoint). Persisted in localStorage under "cart:v1".
import { persistentAtom } from '@nanostores/persistent';
import { atom, computed } from 'nanostores';

/** One cart line as the browser remembers it. */
export interface CartLine {
  variantId: string;
  productId: string;
  name: string;
  variantLabel: string;
  quantity: number;
  unitPriceMinor: number;
  compareAtPriceMinor: number | null;
  productPath: string;
}

/** Largest quantity per line, matching the server rule. */
const MAX_QUANTITY = 20;

/**
 * Checks that a stored value has the shape of a cart line. Corrupted storage is dropped, never trusted.
 * @param value Value read from storage.
 * @returns True for a valid line.
 */
function isCartLine(value: unknown): value is CartLine {
  if (!value || typeof value !== 'object') return false;
  const line = value as Record<string, unknown>;
  return (
    typeof line.variantId === 'string' &&
    typeof line.productId === 'string' &&
    typeof line.name === 'string' &&
    typeof line.quantity === 'number' &&
    typeof line.unitPriceMinor === 'number' &&
    typeof line.productPath === 'string'
  );
}

/**
 * Decodes the stored cart. Invalid JSON or invalid lines are ignored.
 * @param text Stored JSON text.
 * @returns Valid cart lines.
 */
function decodeLines(text: string): CartLine[] {
  try {
    const parsed: unknown = JSON.parse(text);
    return Array.isArray(parsed) ? parsed.filter(isCartLine) : [];
  } catch {
    return [];
  }
}

/** Cart lines, persisted in the browser. */
export const cartLines = persistentAtom<CartLine[]>('cart:v1', [], {
  encode: JSON.stringify,
  decode: decodeLines,
});

/** True while the cart drawer is open. */
export const cartOpen = atom(false);

/** Total number of items in the cart (for the header badge). */
export const cartCount = computed(cartLines, (lines) => lines.reduce((sum, line) => sum + line.quantity, 0));

/** Subtotal at the prices the customer saw. The server quote is the authoritative total. */
export const cartSubtotalMinor = computed(cartLines, (lines) =>
  lines.reduce((sum, line) => sum + line.unitPriceMinor * line.quantity, 0),
);

/**
 * Clamps a quantity to 1..20 and rounds it to an integer.
 * @param quantity Requested quantity.
 * @returns Safe quantity.
 */
function clampLineQuantity(quantity: number): number {
  return Math.min(MAX_QUANTITY, Math.max(1, Math.round(quantity)));
}

/**
 * Adds a variant to the cart, or increases its quantity when it is already there.
 * @param line Line to add; `quantity` is the amount to add.
 */
export function addToCart(line: Omit<CartLine, 'quantity'> & { quantity: number }): void {
  const lines = cartLines.get();
  const existing = lines.find((item) => item.variantId === line.variantId);
  if (existing) {
    cartLines.set(
      lines.map((item) =>
        item.variantId === line.variantId
          ? { ...item, quantity: clampLineQuantity(item.quantity + line.quantity) }
          : item,
      ),
    );
    return;
  }
  cartLines.set([...lines, { ...line, quantity: clampLineQuantity(line.quantity) }]);
}

/**
 * Sets the quantity of a line. Zero or less removes the line.
 * @param variantId Variant id.
 * @param quantity New quantity.
 */
export function setCartQuantity(variantId: string, quantity: number): void {
  if (quantity < 1) {
    removeFromCart(variantId);
    return;
  }
  cartLines.set(
    cartLines
      .get()
      .map((line) =>
        line.variantId === variantId ? { ...line, quantity: clampLineQuantity(quantity) } : line,
      ),
  );
}

/**
 * Removes one line.
 * @param variantId Variant id.
 */
export function removeFromCart(variantId: string): void {
  cartLines.set(cartLines.get().filter((line) => line.variantId !== variantId));
}

/**
 * Replaces the stored lines with the server's corrected quantities and prices after a quote.
 * Unavailable lines are removed; the quote decides what stays.
 * @param lines Lines from the quote, in the cart's shape.
 */
export function replaceCartLines(lines: CartLine[]): void {
  cartLines.set(lines);
}
