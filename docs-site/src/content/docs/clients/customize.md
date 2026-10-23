---
title: Hacerla tuya
description: Qué se puede cambiar sin un desarrollador y qué necesita uno.
sidebar:
  order: 4
---

Hay tres niveles. Empieza por el primero; la mayoría de las tiendas nunca necesitan los otros.

## 1. En el panel (sin código)

El propietario y el equipo pueden cambiar todo esto por sí mismos, cuando quieran:

| Para cambiar…                          | Ve a                                                            |
| -------------------------------------- | --------------------------------------------------------------- |
| Nombre, logo, colores, tipografía      | [Configuración](/admin/settings/) → General y Tema visual       |
| El diseño y el texto del inicio        | [Páginas](/admin/pages-and-content/) → Inicio                   |
| Nosotros, privacidad, términos, páginas propias | [Páginas](/admin/pages-and-content/)                   |
| El texto de los correos                | [Correos](/admin/emails-and-shipping/)                          |
| Opciones y precios de entrega          | [Envíos](/admin/emails-and-shipping/)                           |
| Métodos de pago y datos bancarios      | [Configuración](/admin/settings/) → Pago                        |
| Impuestos y datos de facturación       | [Configuración](/admin/settings/) → Impuestos y Facturación     |
| Quién puede iniciar sesión             | [Usuarios](/admin/team-and-whatsapp/)                           |

El aspecto de la tienda sale de un conjunto pequeño de decisiones de diseño (colores, tipografía, redondez de las esquinas) que se
aplican en todas partes, así que la tienda se mantiene coherente y legible en el celular elijas lo que elijas.

## 2. Una extensión de cliente (un desarrollador, poco código)

Cuando un cliente necesita una **sección especial** o un **estilo extra** que los demás no deben recibir, un desarrollador la añade
en la carpeta propia de ese cliente, `clients/<nombre>/extensions`. El resto del código no se toca, así que las actualizaciones
siguen funcionando.

:::caution[Comprueba antes de prometer]
La carpeta y la conexión existen, pero al escribir esto la tienda aún no carga las secciones de extensión. Pide a tu desarrollador
que confirme el estado actual antes de prometer a un cliente una sección a medida.
:::

## 3. Conexiones nuevas (un desarrollador)

Los proveedores de pago, de facturación electrónica y las conexiones de marketing son **adaptadores**: uno nuevo se escribe contra
la misma interfaz que los existentes y se conecta, así que el resto de la tienda no cambia. Así se añadiría otra pasarela de
tarjetas o un servicio de facturación para la autoridad fiscal a un cliente.

## Actualizar todas las tiendas

Las mejoras de la plantilla se publican a todos los clientes en un solo paso. Cada cliente conserva su configuración, sus datos y
sus claves, y los cambios de base de datos se aplican solos como parte de la actualización.
