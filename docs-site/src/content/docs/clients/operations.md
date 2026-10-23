---
title: Operar la tienda
description: La salud del día a día, la seguridad y los límites que conviene conocer.
sidebar:
  order: 5
---

## Qué mirar y cada cuánto

| Dónde                                          | Qué buscar                                         | Cada cuánto                  |
| ---------------------------------------------- | -------------------------------------------------- | ---------------------------- |
| [Panel](/admin/overview/)                      | Pedidos por preparar, agotados, mensajes sin leer  | Cada día laborable           |
| **Trabajos fallidos** y **Registro de mensajes** | Cualquier fallo u omisión por un mal motivo      | A diario al principio, luego cada semana |
| [Reportes](/admin/reports/)                    | Ventas, más vendidos, stock por reponer            | Cada semana                  |
| Paneles de los proveedores de pago             | Disputas y reembolsos                              | Cada semana                  |

Una tienda sana muestra **0** trabajos fallidos y **0** mensajes fallidos. Ambos están a un clic de la causa.

## La seguridad en palabras sencillas

- **Bots y abusos:** los formularios usan comprobaciones anti-bots invisibles y límites de intentos repetidos; el inicio de sesión
  del panel está protegido igual.
- **Pagos:** la tienda nunca ve los números de tarjeta. Las confirmaciones de pago se verifican criptográficamente antes de marcar
  un pedido como pagado, y la tienda le pregunta al proveedor el estado real en lugar de fiarse del mensaje.
- **Pedidos y facturas:** cada enlace de cliente lleva una clave privada; sin ella no se puede abrir el pedido.
- **Panel:** dos roles, contraseñas guardadas como hash, sesiones que caducan y cada acción comprobada en el servidor.
- **Protecciones del navegador:** otros sitios no pueden mostrar la tienda dentro de un marco y solo se envía la información de
  procedencia necesaria.

La lista detallada de amenazas y la lista de comprobación para desarrolladores están en `docs/SECURITY.md` del repositorio.

## Límites que conviene conocer

Cada cuenta de Cloudflare tiene límites que importan solo cuando una cuenta aloja muchas tiendas: unos 500 Workers, 1.000
espacios de KV, 10.000 colas y **250 tareas programadas**, lo que significa como máximo unas **250 tiendas por cuenta**. El uso
compartido de una cuenta (correos, horas de navegador para los PDF de facturas, operaciones de base de datos) se vigila en el panel
de Cloudflare. Cuando una cuenta se acerca a un límite, las tiendas más grandes se pasan a cuentas propias.

## Actualizaciones y soporte

La agencia actualiza la plantilla y la publica en todas las tiendas, normalmente sin que tengas que hacer nada. Si algo parece
fallar, envía el número del pedido o la dirección de la página, lo que esperabas y una captura; el
[registro de mensajes](/admin/messages-and-notifications/) y el historial del pedido suelen mostrar qué pasó.
