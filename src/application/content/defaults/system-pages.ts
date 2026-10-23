// Default content for the system pages. Setup creates them once from these definitions; afterwards admins edit them.
import type { LocalizedText } from '@/domain/shared/localized-text';
import type { SystemPageSlug } from '@/domain/content/page';
import { LEGAL_PAGE_SECTIONS } from './legal-pages';

/** Default page definition used to seed a system page. */
export interface DefaultPage {
  slug: SystemPageSlug;
  title: LocalizedText;
  sections: { type: string; enabled: boolean; config: Record<string, unknown> }[];
}

/** Code defaults for every system page. */
export const DEFAULT_SYSTEM_PAGES: DefaultPage[] = [
  {
    slug: 'home',
    title: { es: 'Inicio', en: 'Home' },
    sections: [
      { type: 'hero_carousel', enabled: true, config: { slides: [], autoplaySeconds: 6 } },
      {
        type: 'featured_products',
        enabled: true,
        config: {
          title: { es: 'Destacados', en: 'Featured' },
          source: 'featured',
          limit: 8,
          categoryIds: [],
          productIds: [],
          layout: 'carousel',
        },
      },
      {
        type: 'category_grid',
        enabled: true,
        config: { title: { es: 'Compra por categoría', en: 'Shop by category' }, categoryIds: [] },
      },
      {
        type: 'trust_badges',
        enabled: true,
        config: {
          items: [
            { icon: 'truck', text: { es: 'Envíos a todo el país', en: 'Shipping across the country' } },
            { icon: 'return', text: { es: 'Cambios en 10 días', en: 'Exchanges within 10 days' } },
            { icon: 'lock', text: { es: 'Pago seguro', en: 'Secure payment' } },
            { icon: 'chat', text: { es: 'Atención por WhatsApp', en: 'Support on WhatsApp' } },
          ],
        },
      },
      {
        type: 'testimonials',
        enabled: true,
        config: {
          title: { es: 'Lo que dicen nuestros clientes', en: 'What our customers say' },
          includeGoogle: true,
          includeManual: true,
          limit: 6,
        },
      },
      {
        type: 'whatsapp_cta',
        enabled: true,
        config: {
          title: { es: '¿Tienes dudas?', en: 'Have questions?' },
          text: { es: 'Escríbenos y te respondemos rápido.', en: 'Message us and we will reply quickly.' },
          buttonLabel: { es: 'Escribir por WhatsApp', en: 'Chat on WhatsApp' },
        },
      },
    ],
  },
  {
    slug: 'about',
    title: { es: 'Sobre nosotros', en: 'About us' },
    sections: [
      {
        type: 'rich_text',
        enabled: true,
        config: {
          body: {
            es: 'Cuéntanos quiénes somos y por qué hacemos lo que hacemos.',
            en: 'Tell visitors who you are and why you do what you do.',
          },
        },
      },
    ],
  },
  {
    slug: 'contact',
    title: { es: 'Contáctanos', en: 'Contact us' },
    sections: [
      {
        type: 'rich_text',
        enabled: true,
        config: {
          body: {
            es: 'Escríbenos o visítanos. Respondemos lo antes posible.',
            en: 'Write to us or visit us. We reply as soon as we can.',
          },
        },
      },
    ],
  },
  {
    slug: 'privacy',
    title: { es: 'Política de privacidad', en: 'Privacy policy' },
    sections: LEGAL_PAGE_SECTIONS.privacy,
  },
  {
    slug: 'terms',
    title: { es: 'Términos y condiciones', en: 'Terms and conditions' },
    sections: LEGAL_PAGE_SECTIONS.terms,
  },
  {
    slug: 'shipping-returns',
    title: { es: 'Envíos y devoluciones', en: 'Shipping and returns' },
    sections: LEGAL_PAGE_SECTIONS['shipping-returns'],
  },
];

/**
 * Looks up the code default for a system page.
 * @param slug System page slug.
 * @returns The default definition.
 */
export function defaultSystemPage(slug: SystemPageSlug): DefaultPage {
  const page = DEFAULT_SYSTEM_PAGES.find((candidate) => candidate.slug === slug);
  if (!page) throw new Error(`No default for system page ${slug}`);
  return page;
}
