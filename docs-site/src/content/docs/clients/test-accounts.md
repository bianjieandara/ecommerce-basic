---
title: Probar con cuentas de prueba
description: Cómo comprobar pagos, correos, WhatsApp y seguimiento sin gastar dinero ni escribir a clientes reales.
sidebar:
  order: 3.5
---

Antes de abrir la tienda, cada servicio se prueba en su **modo de prueba**. Nada de lo que sigue cobra dinero real ni escribe a
clientes reales. Esta página es el paso a paso; la lista corta para marcar está en [Lanzar una tienda](/clients/launch/).

:::tip[Cuánto tarda]
Los pagos y el correo se prueban en una tarde. WhatsApp depende de que Meta apruebe las plantillas (hasta 24 horas). El seguimiento
de Meta se confirma al día siguiente, cuando Meta ya mostró los eventos.
:::

## Pagos con tarjeta (dLocal Go)

1. Crea una cuenta de pruebas en dLocal Go y copia la **clave de API** y la **clave secreta de pruebas** (Integraciones > API). Las
   de pruebas y las reales son distintas.
2. Haz un pedido en tu tienda y elige tarjeta. En la página de dLocal Go usa una tarjeta de prueba, con cualquier fecha futura y
   cualquier código de seguridad:

| Tarjeta               | Resultado que verás              |
| --------------------- | -------------------------------- |
| 4111 1111 1111 1111   | Aprobada                         |
| 4242 4242 4242 4242   | Aprobada                         |
| 5555 5555 5555 4444   | Rechazada por el banco           |
| 4000 0566 5566 5556   | Fondos insuficientes             |
| 5186 0017 0000 9726   | Tarjeta vencida                  |
| 5105 1051 0510 5100   | Código de seguridad inválido     |

3. Con una aprobada, abre el pedido en el panel: debe estar **Pagado**, con su **factura**, y el cliente debe recibir el correo.
4. Con una rechazada, el pedido debe quedar **Pendiente de pago** y el cliente puede intentarlo de nuevo.

## PayPal

1. En el panel de desarrolladores de PayPal abre **Sandbox > Cuentas**. Ya hay una cuenta de empresa y una personal (la de
   comprador) de ejemplo; puedes crear más.
2. Pon el ID de cliente y el secreto de la app de pruebas en la tienda.
3. Haz un pedido con PayPal. Cuando PayPal te lleve a su página, inicia sesión con la cuenta **personal de pruebas** y aprueba. Al
   volver, el pedido debe estar **Pagado**.
4. Los reembolsos se hacen en PayPal (sección de la transacción) y luego se marca el pedido como **Reembolsado** en el panel.

## Correo

1. Añade tu dominio de envío en Cloudflare (Email Service). Los registros DNS tardan entre 5 y 15 minutos.
2. Mientras el dominio no esté listo, solo se envía a direcciones verificadas de tu cuenta.
3. Haz un pedido de prueba y revisa la bandeja **y** la carpeta de spam. En el panel, **Correos** tiene una vista previa de cada
   mensaje en ambos idiomas y un botón para enviarte una prueba.

## WhatsApp (si lo usas)

1. En la app de Meta, **WhatsApp > Configuración de la API** te da un número de pruebas gratuito. Añade tu propio teléfono como
   destinatario y envía el mensaje de ejemplo `hello_world` para confirmar que todo conecta.
2. En el panel, **WhatsApp**: revisa el texto de cada plantilla, **Enviar a Meta** y luego **Sincronizar estado**. Meta responde en
   hasta 24 horas. Si la rechaza, el motivo aparece ahí.
3. Con la plantilla aprobada, pulsa **Enviar prueba**. Después marca un pedido como enviado y comprueba que el mensaje trae el
   código de seguimiento y el enlace al pedido.
4. En **Mensajes y notificaciones** debe verse el estado pasar de enviado a entregado y leído.

Solo se escribe a clientes que dieron su permiso al comprar. Meta cobra por cada mensaje de plantilla entregado; revisa su tabla de
precios actual antes de hacer números.

## Pixel de Meta y catálogo (si lo usas)

1. En el Administrador de eventos de Meta abre **Probar eventos** y copia el código de prueba. Pégalo en
   [Configuración](/admin/settings/) > Marketing, junto con el ID del Pixel.
2. Abre tu tienda en una ventana privada: hasta que aceptes las cookies, **no** debe enviarse nada a Meta. Acepta y recorre la
   tienda: ver un producto, añadirlo al carrito, empezar el pago, pagar.
3. Cada paso debe aparecer en **Probar eventos**, dos veces: una desde el navegador y otra desde el servidor, y Meta debe contarlas
   como un solo evento.
4. **Borra el código de prueba antes de lanzar.** Con el código puesto, los eventos igualmente cuentan para tus anuncios.
5. Catálogo: en Commerce Manager crea una fuente de datos con la dirección de tu catálogo (`/feeds/products.xml`). Su sección de
   diagnósticos muestra qué productos tienen errores.

## Si algo no sale

| Qué ves                                  | Qué suele ser                                                                  |
| ---------------------------------------- | ------------------------------------------------------------------------------ |
| El pago se hizo pero el pedido no cambia | El proveedor no pudo avisar a la tienda: la dirección de la tienda no es pública o está mal escrita |
| El correo no llega                       | El dominio aún no está verificado, o está en spam                              |
| WhatsApp dice «omitido»                  | La plantilla no está aprobada en ese idioma, o está desactivada                |
| Meta no muestra eventos                  | El visitante no aceptó las cookies, o el ID del Pixel está mal                  |

Los detalles técnicos y los códigos de error están en `docs/TESTING_INTEGRATIONS.md` del repositorio.
