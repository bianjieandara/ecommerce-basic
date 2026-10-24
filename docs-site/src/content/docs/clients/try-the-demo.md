---
title: Prueba la demo
description: "Cómo recorrer la tienda de demostración: la tienda, el pago de prueba, el panel y lo que se reinicia cada noche."
sidebar:
  order: 3.6
---

La tienda de demostración es una tienda real, con productos de ejemplo, que cualquiera puede probar. Puedes comprar, cambiar
precios, crear productos y entrar al panel. Nada cobra dinero y ningún correo sale de la tienda.

**Dónde está:** [ecommerce.relion-app.com](https://ecommerce.relion-app.com/es/). El acceso al panel está en
[ecommerce.relion-app.com/admin/login](https://ecommerce.relion-app.com/admin/login). El correo de acceso es
`demo@ecommerce.relion-app.com`; la contraseña se muestra en la misma página de acceso.

:::caution[Todo se deshace cada noche]
A las 03:00 (hora de la tienda) la demo vuelve a su estado inicial. Lo que cambies, tus pedidos y tus productos desaparecen. Si
quieres dejar algo a alguien, hazlo en el mismo día.
:::

## Comprar con un pago de prueba

1. Agrega un producto al carrito y ve al pago.
2. Elige **tarjeta**. En la página de dLocal Go usa `4111 1111 1111 1111`, cualquier fecha futura y cualquier código de seguridad.
3. Para pagar con PayPal, usa el comprador de pruebas que aparece en la página de pago, si lo hay. Si no aparece, pide un acceso.
4. Al terminar, abre la página del pedido. Ahí verás el estado y los correos que la tienda habría enviado: se abren con el enlace
   del pedido y no salen de la demo.

## Recorrer el panel

En el panel, la tarjeta **Prueba esto** te lleva paso a paso por seis tareas:

1. Marca un pedido como pagado y luego como enviado.
2. Emite una factura de un pedido pagado.
3. Cambia el color en Configuración > Tema y mira la tienda.
4. Agrega un producto con una foto.
5. Ajusta el stock de un producto.
6. Abre un informe y compara dos periodos.

La tarjeta **Reiniciar la demo ahora** vuelve a poner la tienda en su estado inicial en el momento.

## Lo que la demo no permite

La cuenta de demostración no puede invitar administradores, cambiar roles, desactivar usuarios, pedir restablecer su contraseña
ni emitir reembolsos. Esas acciones aparecen bloqueadas con el mensaje de demostración. Todo lo demás está abierto.

## Lo que sigue siendo real

- La tienda, el panel, el carrito y el pago de prueba funcionan como en una tienda de verdad.
- Los pagos usan los entornos de prueba de dLocal Go y PayPal: no se cobra nada.
- Los correos se guardan, no se envían. El sitio no escribe a ningún cliente.

¿Quieres tu propia tienda con este mismo sistema? Lee [Lanzar una tienda](/clients/launch/).
