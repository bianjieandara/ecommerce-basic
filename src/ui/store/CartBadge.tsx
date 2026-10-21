// Header cart counter (Preact island). Renders nothing when the cart is empty.
import { useStore } from '@nanostores/preact';
import { cartCount } from '../stores/cart';

/** Small count bubble on the cart icon. */
export default function CartBadge() {
  const count = useStore(cartCount);
  if (count === 0) return null;
  return (
    <span class="bg-accent text-on-primary absolute -top-0.5 -right-0.5 min-w-5 rounded-full px-1 text-center text-xs font-bold">
      {count}
    </span>
  );
}
