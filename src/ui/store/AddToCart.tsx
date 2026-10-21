// Add-to-cart control on the product page (Preact island): quantity stepper and the add button.
// The labels arrive already translated from the server, so the island needs no dictionary.
import { useState } from 'preact/hooks';
import { addToCart, cartOpen, type CartLine } from '../stores/cart';
import { showToast } from '../stores/toast';

/** Props of the add-to-cart control. */
export interface AddToCartProps {
  productId: string;
  productName: string;
  productPath: string;
  variantId: string;
  variantLabel: string;
  priceMinor: number;
  compareAtPriceMinor: number | null;
  stock: number;
  trackInventory: boolean;
  labels: { add: string; added: string; quantity: string; soldOut: string };
}

/** Largest quantity a single add can choose. */
const MAX_PER_ADD = 20;

/**
 * Quantity stepper and button that adds the chosen variant to the cart.
 * @param props Product and variant data plus translated labels.
 */
export default function AddToCart(props: AddToCartProps) {
  const [quantity, setQuantity] = useState(1);
  const available = !props.trackInventory || props.stock > 0;
  const maximum = props.trackInventory ? Math.min(MAX_PER_ADD, props.stock) : MAX_PER_ADD;

  const add = () => {
    const line: Omit<CartLine, 'quantity'> & { quantity: number } = {
      variantId: props.variantId,
      productId: props.productId,
      name: props.productName,
      variantLabel: props.variantLabel,
      quantity,
      unitPriceMinor: props.priceMinor,
      compareAtPriceMinor: props.compareAtPriceMinor,
      productPath: props.productPath,
    };
    addToCart(line);
    cartOpen.set(true);
    showToast(props.labels.added, 'success');
  };

  return (
    <div class="flex flex-col gap-3">
      <div class="flex items-center gap-3">
        <span class="text-sm font-medium">{props.labels.quantity}</span>
        <button
          type="button"
          class="rounded-brand border-text/20 min-h-11 min-w-11 border"
          onClick={() => setQuantity((value) => Math.max(1, value - 1))}
          disabled={!available || quantity <= 1}
          aria-label="−"
        >
          −
        </button>
        <output class="min-w-8 text-center font-semibold" aria-live="polite">
          {quantity}
        </output>
        <button
          type="button"
          class="rounded-brand border-text/20 min-h-11 min-w-11 border"
          onClick={() => setQuantity((value) => Math.min(maximum, value + 1))}
          disabled={!available || quantity >= maximum}
          aria-label="+"
        >
          +
        </button>
      </div>
      <button
        type="button"
        onClick={add}
        disabled={!available}
        class="rounded-brand bg-primary text-on-primary inline-flex min-h-12 items-center justify-center px-6 font-semibold disabled:opacity-50"
      >
        {available ? props.labels.add : props.labels.soldOut}
      </button>
    </div>
  );
}
