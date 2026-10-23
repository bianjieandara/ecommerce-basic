// Default legal pages (privacy, terms, shipping and returns), bilingual. Each page is a list of sections: a lead with who the
// seller is and the date, a short "in brief" summary, the clauses as markdown and, in the privacy policy, the rights block.
// The page title comes from the page itself, so the markdown has no title heading.
// Placeholders {{storeName}}, {{contactEmail}}, {{address}}, {{country}} and {{lastUpdated}} are filled when the page is shown
// (see fillSectionPlaceholders). These are templates to be reviewed by the client's lawyer before going live; they are not
// legal advice.
import type { LocalizedText } from '@/domain/shared/localized-text';

/** One section of a default page: the shape DEFAULT_SYSTEM_PAGES uses. */
export interface DefaultSection {
  type: string;
  enabled: boolean;
  config: Record<string, unknown>;
}

/** A markdown block. */
const markdown = (body: LocalizedText): DefaultSection => ({ type: 'rich_text', enabled: true, config: { body } });

/** The "in brief" panel: a few plain-language lines that summarise the page. */
const summary = (items: LocalizedText[]): DefaultSection => ({
  type: 'summary',
  enabled: true,
  config: { title: { es: 'En breve', en: 'In brief' }, items: items.map((text) => ({ text })) },
});

/** Privacy policy: covers GDPR, CCPA/CPRA, LGPD and Colombian Law 1581 of 2012. */
const PRIVACY_SECTIONS: DefaultSection[] = [
  markdown({
    es: `**Responsable del tratamiento:** {{storeName}}, {{address}}. Contacto: {{contactEmail}}.

**Última actualización:** {{lastUpdated}}.`,
    en: `**Data controller:** {{storeName}}, {{address}}. Contact: {{contactEmail}}.

**Last updated:** {{lastUpdated}}.`,
  }),
  summary([
    {
      es: 'Guardamos los datos de tus pedidos, tu contacto y datos de navegación anónimos.',
      en: 'We keep your order details, your contact details and anonymous browsing data.',
    },
    {
      es: 'Los usamos para entregar tus pedidos. Las novedades y WhatsApp, solo con tu permiso.',
      en: 'We use them to deliver your orders. News and WhatsApp messages only with your permission.',
    },
    {
      es: 'Puedes pedir ver, corregir o borrar tus datos cuando quieras.',
      en: 'You can ask to see, correct or delete your data at any time.',
    },
  ]),
  markdown({
    es: `## Datos que recopilamos
Nombre, correo, teléfono, dirección de entrega, datos de facturación (cuando los pides), contenido de tus mensajes y datos de navegación anónimos (páginas vistas, dispositivo, país).

## Para qué los usamos
Procesar y entregar tus pedidos, emitir facturas, atender consultas, enviarte confirmaciones y, solo si lo autorizas, novedades y mensajes de WhatsApp. Medimos la tienda con datos agregados y sin cookies de publicidad sin tu consentimiento.

## Bases legales
Ejecución del contrato (pedidos), obligaciones legales (facturación), tu consentimiento (marketing y WhatsApp) e interés legítimo (seguridad y prevención de fraude).

## Encargados
Usamos proveedores para operar la tienda: Cloudflare (alojamiento y envío de correos), dLocal Go y PayPal (pagos), Google (reseñas y mapas), Meta (WhatsApp y medición de publicidad cuando das tu consentimiento).

## Transferencias internacionales
Algunos proveedores procesan datos fuera de tu país con garantías contractuales adecuadas.

## Conservación
Conservamos los datos de pedidos y facturas durante el tiempo que exige la ley; los datos de contacto y navegación se eliminan cuando dejan de ser necesarios.`,
    en: `## Data we collect
Name, email, phone, delivery address, billing details (when you request an invoice), the content of your messages, and anonymous browsing data (pages viewed, device, country).

## How we use it
To process and deliver orders, issue invoices, answer enquiries, send confirmations and, only if you agree, news and WhatsApp messages. We measure the store with aggregated data, and advertising cookies only run with your consent.

## Legal bases
Performance of a contract (orders), legal obligations (invoicing), your consent (marketing and WhatsApp) and legitimate interest (security and fraud prevention).

## Processors
We use providers to run the store: Cloudflare (hosting and email delivery), dLocal Go and PayPal (payments), Google (reviews and maps), Meta (WhatsApp and advertising measurement when you consent).

## International transfers
Some providers process data outside your country under adequate contractual safeguards.

## Retention
We keep order and invoice data for as long as the law requires; contact and browsing data are deleted once they are no longer needed.`,
  }),
  {
    type: 'callout',
    enabled: true,
    config: {
      title: { es: 'Tus derechos', en: 'Your rights' },
      text: {
        es: 'Puedes conocer, actualizar, corregir o suprimir tus datos, revocar tu consentimiento y oponerte a tratamientos escribiendo a {{contactEmail}}. Si no estás conforme, puedes acudir a la Superintendencia de Industria y Comercio (Colombia) o a la autoridad de protección de datos de tu país.',
        en: 'You can access, update, correct or delete your data, withdraw consent and object to processing by writing to {{contactEmail}}. You may also contact the data protection authority in your country.',
      },
      cta: {
        href: 'mailto:{{contactEmail}}',
        label: { es: 'Escribir a {{contactEmail}}', en: 'Write to {{contactEmail}}' },
      },
    },
  },
  markdown({
    es: `## Cookies y almacenamiento local
Usamos almacenamiento necesario para el carrito y la sesión. Las herramientas de medición y publicidad solo se activan con tu consentimiento.

## Menores
Nuestros servicios no están dirigidos a menores de 18 años sin supervisión de un adulto.

## Cambios
Podemos actualizar esta política. La fecha de arriba indica la última versión.`,
    en: `## Cookies and local storage
We use storage needed for the cart and the session. Measurement and advertising tools only run with your consent.

## Minors
Our services are not directed to people under 18 without the supervision of an adult.

## Changes
We may update this policy. The date above shows the latest version.`,
  }),
];

/** Terms of sale. */
const TERMS_SECTIONS: DefaultSection[] = [
  markdown({
    es: `**Vendedor:** {{storeName}}, {{address}}. Contacto: {{contactEmail}}.

**Última actualización:** {{lastUpdated}}.`,
    en: `**Seller:** {{storeName}}, {{address}}. Contact: {{contactEmail}}.

**Last updated:** {{lastUpdated}}.`,
  }),
  summary([
    {
      es: 'El precio final se muestra antes de pagar.',
      en: 'The final price is shown before you pay.',
    },
    {
      es: 'El pedido se confirma cuando el pago se registra; si no se paga a tiempo, se cancela solo.',
      en: 'An order is confirmed when the payment is recorded; if it is not paid in time, it is cancelled on its own.',
    },
    {
      es: 'Si un producto deja de estar disponible, te avisamos y te devolvemos el dinero.',
      en: 'If a product becomes unavailable, we tell you and refund you.',
    },
  ]),
  markdown({
    es: `## Precios
Los precios se muestran en {{country}} con el impuesto indicado en cada producto. El precio final aparece antes de pagar.

## Pedidos y pagos
Un pedido se confirma cuando el pago se registra. Los pedidos pendientes de pago se cancelan automáticamente cuando vence el plazo indicado en el checkout.

## Disponibilidad
Si un producto deja de estar disponible después de tu compra, te avisamos y te devolvemos el dinero.

## Facturas
Emitimos facturas según la normativa vigente. Puedes solicitar tus datos fiscales en el checkout.

## Derecho de retracto y devoluciones
Consulta la sección de envíos y devoluciones para los plazos y condiciones.

## Responsabilidad
No respondemos por usos indebidos del producto ni por retrasos de terceros fuera de nuestro control.

## Ley aplicable
Estas condiciones se rigen por las leyes del país del vendedor.`,
    en: `## Prices
Prices are shown in {{country}} with the tax stated on each product. The final price is shown before you pay.

## Orders and payments
An order is confirmed when the payment is recorded. Orders waiting for payment are cancelled automatically when the time limit shown at checkout expires.

## Availability
If a product becomes unavailable after you buy it, we will tell you and refund you.

## Invoices
We issue invoices under the applicable rules. You can request your tax details at checkout.

## Withdrawal and returns
See the shipping and returns page for deadlines and conditions.

## Liability
We are not responsible for improper use of a product or for delays caused by third parties outside our control.

## Governing law
These terms are governed by the laws of the seller's country.`,
  }),
];

/** Shipping and returns policy. */
const SHIPPING_RETURNS_SECTIONS: DefaultSection[] = [
  markdown({
    es: '**Última actualización:** {{lastUpdated}}.',
    en: '**Last updated:** {{lastUpdated}}.',
  }),
  summary([
    {
      es: 'El costo del envío se muestra antes de pagar.',
      en: 'The shipping cost is shown before you pay.',
    },
    {
      es: 'Puedes pedir un cambio o una devolución dentro de los 10 días siguientes a la entrega.',
      en: 'You can ask for an exchange or a return within 10 days of delivery.',
    },
    {
      es: 'Los reembolsos llegan por el mismo medio de pago, en máximo 15 días hábiles.',
      en: 'Refunds go back to the original payment method within 15 business days.',
    },
  ]),
  markdown({
    es: `## Envíos
Entregamos en las zonas indicadas en el checkout. El costo se muestra antes de pagar. Algunos envíos son gratis desde un monto mínimo.

## Recogida en tienda
Puedes recoger tu pedido en nuestra tienda sin costo en el horario publicado.

## Cambios y devoluciones
Puedes solicitar un cambio o devolución dentro de los 10 días siguientes a la entrega, con el producto sin uso y en su empaque original. Escríbenos a {{contactEmail}} con tu número de pedido.

## Reembolsos
Los reembolsos se hacen por el mismo medio de pago en un plazo máximo de 15 días hábiles tras recibir y revisar el producto.`,
    en: `## Shipping
We deliver to the areas shown at checkout. The cost is shown before you pay. Some shipments are free above a minimum amount.

## Store pickup
You can pick up your order at our store at no cost during the published hours.

## Exchanges and returns
You can request an exchange or a return within 10 days of delivery, with the product unused and in its original packaging. Write to {{contactEmail}} with your order number.

## Refunds
Refunds go back to the original payment method within 15 business days after we receive and check the product.`,
  }),
];

/** Sections of each default legal page, by slug. */
export const LEGAL_PAGE_SECTIONS = {
  privacy: PRIVACY_SECTIONS,
  terms: TERMS_SECTIONS,
  'shipping-returns': SHIPPING_RETURNS_SECTIONS,
} satisfies Record<string, DefaultSection[]>;
