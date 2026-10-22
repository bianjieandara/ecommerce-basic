// Default legal texts (privacy, terms, shipping and returns), bilingual, as markdown.
// Placeholders {{storeName}}, {{contactEmail}}, {{address}}, {{country}} and {{lastUpdated}} are filled by fillPlaceholders.
// These are templates to be reviewed by the client's lawyer before going live; they are not legal advice.
import type { LocalizedText } from '@/domain/shared/localized-text';

/** Privacy policy: covers GDPR, CCPA/CPRA, LGPD and Colombian Law 1581 of 2012. */
export const PRIVACY_POLICY: LocalizedText = {
  es: `## Política de privacidad

**Responsable del tratamiento:** {{storeName}}, {{address}}. Contacto: {{contactEmail}}.
**Última actualización:** {{lastUpdated}}.

### Datos que recopilamos
Nombre, correo, teléfono, dirección de entrega, datos de facturación (cuando los pides), contenido de tus mensajes y datos de navegación anónimos (páginas vistas, dispositivo, país).

### Para qué los usamos
Procesar y entregar tus pedidos, emitir facturas, atender consultas, enviarte confirmaciones y, solo si lo autorizas, novedades y mensajes de WhatsApp. Medimos la tienda con datos agregados y sin cookies de publicidad sin tu consentimiento.

### Bases legales
Ejecución del contrato (pedidos), obligaciones legales (facturación), tu consentimiento (marketing y WhatsApp) e interés legítimo (seguridad y prevención de fraude).

### Encargados
Usamos proveedores para operar la tienda: Cloudflare (alojamiento y envío de correos), dLocal Go y PayPal (pagos), Google (reseñas y mapas), Meta (WhatsApp y medición de publicidad cuando das tu consentimiento).

### Transferencias internacionales
Algunos proveedores procesan datos fuera de tu país con garantías contractuales adecuadas.

### Conservación
Conservamos los datos de pedidos y facturas durante el tiempo que exige la ley; los datos de contacto y navegación se eliminan cuando dejan de ser necesarios.

### Tus derechos
Puedes conocer, actualizar, corregir o suprimir tus datos, revocar tu consentimiento y oponerte a tratamientos escribiendo a {{contactEmail}}. Si no estás conforme, puedes acudir a la Superintendencia de Industria y Comercio (Colombia) o a la autoridad de protección de datos de tu país.

### Cookies y almacenamiento local
Usamos almacenamiento necesario para el carrito y la sesión. Las herramientas de medición y publicidad solo se activan con tu consentimiento.

### Menores
Nuestros servicios no están dirigidos a menores de 18 años sin supervisión de un adulto.

### Cambios
Podemos actualizar esta política. La fecha de arriba indica la última versión.`,
  en: `## Privacy policy

**Data controller:** {{storeName}}, {{address}}. Contact: {{contactEmail}}.
**Last updated:** {{lastUpdated}}.

### Data we collect
Name, email, phone, delivery address, billing details (when you request an invoice), the content of your messages, and anonymous browsing data (pages viewed, device, country).

### How we use it
To process and deliver orders, issue invoices, answer enquiries, send confirmations and, only if you agree, news and WhatsApp messages. We measure the store with aggregated data, and advertising cookies only run with your consent.

### Legal bases
Performance of a contract (orders), legal obligations (invoicing), your consent (marketing and WhatsApp) and legitimate interest (security and fraud prevention).

### Processors
We use providers to run the store: Cloudflare (hosting and email delivery), dLocal Go and PayPal (payments), Google (reviews and maps), Meta (WhatsApp and advertising measurement when you consent).

### International transfers
Some providers process data outside your country under adequate contractual safeguards.

### Retention
We keep order and invoice data for as long as the law requires; contact and browsing data are deleted once they are no longer needed.

### Your rights
You can access, update, correct or delete your data, withdraw consent and object to processing by writing to {{contactEmail}}. You may also contact the data protection authority in your country.

### Cookies and local storage
We use storage needed for the cart and the session. Measurement and advertising tools only run with your consent.

### Minors
Our services are not directed to people under 18 without the supervision of an adult.

### Changes
We may update this policy. The date above shows the latest version.`,
};

/** Terms of sale. */
export const TERMS: LocalizedText = {
  es: `## Términos y condiciones

**Vendedor:** {{storeName}}, {{address}}. Contacto: {{contactEmail}}.
**Última actualización:** {{lastUpdated}}.

### Precios
Los precios se muestran en {{country}} con el impuesto indicado en cada producto. El precio final aparece antes de pagar.

### Pedidos y pagos
Un pedido se confirma cuando el pago se registra. Los pedidos pendientes de pago se cancelan automáticamente cuando vence el plazo indicado en el checkout.

### Disponibilidad
Si un producto deja de estar disponible después de tu compra, te avisamos y te devolvemos el dinero.

### Facturas
Emitimos facturas según la normativa vigente. Puedes solicitar tus datos fiscales en el checkout.

### Derecho de retracto y devoluciones
Consulta la sección de envíos y devoluciones para los plazos y condiciones.

### Responsabilidad
No respondemos por usos indebidos del producto ni por retrasos de terceros fuera de nuestro control.

### Ley aplicable
Estas condiciones se rigen por las leyes del país del vendedor.`,
  en: `## Terms and conditions

**Seller:** {{storeName}}, {{address}}. Contact: {{contactEmail}}.
**Last updated:** {{lastUpdated}}.

### Prices
Prices are shown in {{country}} with the tax stated on each product. The final price is shown before you pay.

### Orders and payments
An order is confirmed when the payment is recorded. Orders waiting for payment are cancelled automatically when the time limit shown at checkout expires.

### Availability
If a product becomes unavailable after you buy it, we will tell you and refund you.

### Invoices
We issue invoices under the applicable rules. You can request your tax details at checkout.

### Withdrawal and returns
See the shipping and returns page for deadlines and conditions.

### Liability
We are not responsible for improper use of a product or for delays caused by third parties outside our control.

### Governing law
These terms are governed by the laws of the seller's country.`,
};

/** Shipping and returns policy. */
export const SHIPPING_RETURNS: LocalizedText = {
  es: `## Envíos y devoluciones

**Última actualización:** {{lastUpdated}}.

### Envíos
Entregamos en las zonas indicadas en el checkout. El costo se muestra antes de pagar. Algunos envíos son gratis desde un monto mínimo.

### Recogida en tienda
Puedes recoger tu pedido en nuestra tienda sin costo en el horario publicado.

### Cambios y devoluciones
Puedes solicitar un cambio o devolución dentro de los 10 días siguientes a la entrega, con el producto sin uso y en su empaque original. Escríbenos a {{contactEmail}} con tu número de pedido.

### Reembolsos
Los reembolsos se hacen por el mismo medio de pago en un plazo máximo de 15 días hábiles tras recibir y revisar el producto.`,
  en: `## Shipping and returns

**Last updated:** {{lastUpdated}}.

### Shipping
We deliver to the areas shown at checkout. The cost is shown before you pay. Some shipments are free above a minimum amount.

### Store pickup
You can pick up your order at our store at no cost during the published hours.

### Exchanges and returns
You can request an exchange or a return within 10 days of delivery, with the product unused and in its original packaging. Write to {{contactEmail}} with your order number.

### Refunds
Refunds go back to the original payment method within 15 business days after we receive and check the product.`,
};
