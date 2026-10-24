// Starter content for a new store: what a client needs before checkout works, and nothing that looks like sample data.
// Setup writes it once, when the store has no shipping methods (see SetupFirstOwner). Pages and settings already fall back
// to code defaults, so only rows that checkout reads have to exist.
import type { ShippingMethodRecord } from '@/application/ports/ordering';

/**
 * Payment methods a new store offers. Cash on delivery needs no provider keys and no instructions, so checkout works from
 * setup. The schema default (WhatsApp only) cannot take an order: a new store has no WhatsApp number yet.
 */
export const STARTER_PAYMENT_METHODS = ['cash_on_delivery'] as const;

/**
 * Shipping methods of a new store. Pickup is ready to use. The courier method starts inactive with no price: the owner
 * sets its cost and turns it on in the admin, so a new store never charges a guessed amount.
 */
export const STARTER_SHIPPING_METHODS: ShippingMethodRecord[] = [
  {
    id: 'ship-flat',
    kind: 'flat',
    name: { es: 'Envío estándar', en: 'Standard shipping' },
    description: { es: '', en: '' },
    priceMinor: 0,
    freeOverMinor: null,
    isActive: false,
    position: 0,
  },
  {
    id: 'ship-pickup',
    kind: 'pickup',
    name: { es: 'Recoger en tienda', en: 'Store pickup' },
    description: { es: '', en: '' },
    priceMinor: 0,
    freeOverMinor: null,
    isActive: true,
    position: 1,
  },
];
