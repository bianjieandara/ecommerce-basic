---
title: Lanzar una tienda
description: Los pasos desde un acuerdo firmado hasta una tienda en vivo y probada.
sidebar:
  order: 3
---

Los pasos técnicos los hace la agencia (o tu desarrollador) y están escritos completos en `docs/NEW_CLIENT.md` del repositorio. Esta
página es el resumen, para que sepas qué ocurre y qué se te pide.

## El camino

1. **Reúne** lo de [Qué debes aportar](/clients/requirements-and-costs/).
2. **Crear los recursos de la tienda.** Un comando crea en Cloudflare la base de datos, el almacenamiento, la caché y las colas de
   tareas de la tienda, y un archivo de configuración para el cliente.
3. **Configurar la tienda.** La dirección, el correo remitente, el modo de pago (prueba o real) y la clave anti-bots.
4. **Conectar los servicios** (abajo).
5. **Publicar.** La tienda se construye y se publica, y se prepara la base de datos.
6. **Primer inicio de sesión.** La primera cuenta de **propietario** se crea una sola vez en `/admin/setup` con un código privado, y
   después ese código se elimina.
7. **Llenar la tienda**: configuración, productos, páginas, envíos, texto de los correos. Aquí el dueño pasa la mayor parte del
   tiempo.
8. **Probar** y luego **salir en vivo** cambiando los pagos de claves de prueba a claves reales.

## Conectar los servicios

### Dominio y anti-bots

El nombre de host de la tienda se añade a la tienda, y se crea para él un widget de Cloudflare **Turnstile**. Turnstile es gratis e
invisible para quien compra.

### Correo

Añade tu dominio de envío al Email Service de Cloudflare y usa una dirección de ese dominio como remitente, para que los mensajes
estén autenticados.

### Pagos

- **Tarjeta (dLocal Go):** una clave de API y una clave secreta. La tienda registra una dirección de notificación en
  `/api/webhooks/dlocalgo` para que dLocal Go le avise cuando un pago se complete.
- **PayPal:** un ID de cliente y un secreto, y un webhook en `/api/webhooks/paypal`.

Empieza con las claves de **prueba** de cada proveedor, haz una compra con cada uno y solo entonces cambia a las claves reales.

### WhatsApp (opcional)

Crea una cuenta de Meta Business y una app de Meta con el producto WhatsApp, anota el ID del número de teléfono y el ID de la cuenta
de empresa, y crea un token permanente. La tienda envía sus plantillas de mensaje a Meta y Meta las aprueba (a menudo en minutos o
en un día). No se envía nada a los clientes hasta que una plantilla está aprobada y el cliente aceptó recibir mensajes.

### Pixel de Meta y catálogo (opcional)

Añade el ID de tu Pixel en [Configuración](/admin/settings/) (Marketing). El seguimiento empieza solo después de que el visitante
acepta las cookies.

## Probar antes de lanzar

Recorre esta lista en la dirección real, con pagos de prueba. El paso a paso de cada servicio está en
[Probar con cuentas de prueba](/clients/test-accounts/):

- [ ] La tienda carga en `/es` y `/en`, en un celular y en un portátil.
- [ ] `/admin` pide iniciar sesión y el propietario puede entrar.
- [ ] Una compra con **tarjeta** en modo de prueba llega a **Pagado**, el correo del cliente llega y se emite una **factura**.
- [ ] Una compra con **PayPal** en modo de prueba llega a **Pagado**.
- [ ] Un pedido por **transferencia bancaria** muestra tus datos del banco y se puede marcar como pagado a mano.
- [ ] Un producto agotado no se puede comprar y ofrece el aviso de «vuelve a haber stock».
- [ ] La página de **Contacto** muestra tu WhatsApp, correo, teléfono y dirección, y cada tarjeta abre lo que debe (chat, correo, llamada).
- [ ] La política de privacidad, los términos y la página de envíos dicen lo que es cierto para tu negocio.
- [ ] El panel muestra **0** trabajos fallidos y **0** mensajes fallidos.

## Después del lanzamiento

Cambia las claves de pago a las **reales**, haz tú mismo una compra pequeña real y reembólsala, y vigila el
[registro de mensajes](/admin/messages-and-notifications/) y el panel durante los primeros días.
