---
title: Qué recibes
description: Las funciones de la tienda, qué es opcional y qué se está terminando.
sidebar:
  order: 1
---

Un cliente recibe **su propia tienda**: con su dirección, base de datos, panel, imágenes, correos y estadísticas. Se construye con
la misma plantilla que la de cualquier otro cliente, así que las mejoras llegan a todos, pero los datos y la configuración de
nadie se comparten.

## La tienda

- **Catálogo** con categorías, variantes (talla, color…), precios de oferta, filtros, búsqueda con sugerencias y productos
  relacionados.
- **Carrito y pago** en una sola página, con opciones de entrega, datos de factura opcionales y **cinco métodos de pago**: tarjeta
  (dLocal Go), PayPal, WhatsApp, transferencia bancaria y pago contra entrega.
- **Página del pedido y correos** para que los clientes sigan su compra, con facturas en PDF.
- **Español e inglés** en todas partes, con direcciones web distintas para cada idioma.
- **Primero el celular:** pensada para pantallas de 360 px, con botones grandes y movimiento reducido para quien lo prefiere.
- **Lista para buscadores:** títulos, descripciones, mapa del sitio, datos estructurados de producto y vistas previas al compartir.
- **Rápida:** las páginas se guardan en caché en el borde y las imágenes se sirven en el tamaño justo. En una prueba con tamaño de
  celular, las páginas obtienen 96–99 en rendimiento, 100 en buenas prácticas y SEO, y 96–100 en accesibilidad en Lighthouse de
  Google.

## El panel

Productos y variantes, categorías y atributos, una biblioteca de imágenes, **inventario con el historial completo de cada cambio
de stock**, pedidos con historial, facturas, mensajes de clientes, un **editor de páginas** para el inicio y las páginas de
contenido, el texto de los correos, métodos de envío, testimonios, usuarios con dos roles, reportes y configuración para todo.
Mira la [guía del panel](/admin/overview/).

## Cómo funciona por dentro

- **Correos automáticos** en cada paso del pedido y, opcionalmente, **mensajes de WhatsApp** (plantillas aprobadas por Meta).
- **Protección del stock:** el stock se reserva mientras un pago con tarjeta está pendiente, se libera cuando vence y nunca se
  sobrevende.
- **Tareas en segundo plano con reintentos:** si falla un correo o un PDF, la tienda lo intenta de nuevo y, si sigue fallando, lo
  deja a la vista de un propietario.
- **Seguridad básica incluida:** protección anti-bots en los formularios, límites de intentos, notificaciones de pago firmadas,
  enlaces privados de pedido y cabeceras de protección del navegador. Mira [Operar la tienda](/clients/operations/).

## Módulos opcionales

| Módulo                                    | Necesitas                                                                                   |
| ----------------------------------------- | ------------------------------------------------------------------------------------------- |
| **Mensajes de WhatsApp**                  | Una cuenta de Meta Business y un número de WhatsApp Business. Meta cobra por mensaje de plantilla. |
| **Pixel de Meta y catálogo de productos** | Una cuenta de Meta. El seguimiento espera el consentimiento del visitante.                   |
| **Reseñas de Google en el inicio**        | Un lugar de Google Business.                                                                |
| **Facturación electrónica para la autoridad fiscal** | Un proveedor certificado, configurado por cliente.                              |
| **Ayuda de IA para traducir textos**      | Nada extra; usa la IA de Cloudflare y solo actúa cuando se usa.                              |

## ¿Qué tan completa está?

Las funciones de compra, pago, pedidos, facturación, stock, catálogo, contenido y reportes que describe esta guía están
construidas y probadas, incluidos pagos reales con tarjeta y PayPal en los entornos de prueba de los proveedores. Algunas piezas
opcionales aún se están terminando (por ejemplo, parte del marketing y las herramientas de despliegue para varios clientes). El
archivo `docs/PROGRESS.md` del repositorio lista el estado de cada etapa, y tu contacto te dirá exactamente qué incluye tu
lanzamiento.
