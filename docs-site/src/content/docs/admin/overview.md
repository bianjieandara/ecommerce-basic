---
title: Panel de administración
description: Iniciar sesión, el panel, el menú y quién puede hacer qué.
sidebar:
  order: 1
---

El panel es donde trabaja quien lleva la tienda. Está en `/admin` en la dirección de tu tienda (por ejemplo
`https://tu-tienda.com/admin`) y funciona en un celular o en un portátil.

## Iniciar sesión

![La página de inicio de sesión](../../../assets/screens/es/admin-login.png)

Escribe tu correo y tu contraseña. Si la olvidaste, elige **¿Olvidaste tu contraseña?** y la tienda te envía un enlace válido
durante 30 minutos. Hay un límite de intentos y una comprobación anti-bots, así que adivinar contraseñas no funciona.

:::note[La primera vez]
Al lanzar una tienda, quien la publica abre `/admin/setup` una sola vez, escribe el código de configuración que recibió y crea la
primera cuenta de **propietario**. Esa página deja de funcionar en cuanto existe un propietario. Mira
[Lanzar una tienda](/clients/launch/).
:::

## El panel

La primera pantalla muestra cómo va la tienda ahora mismo.

![El panel](../../../assets/screens/es/admin-dashboard.png)

La pantalla tiene dos columnas. A la izquierda:

- Un gráfico con las ventas de los **últimos 14 días**.
- **Pedidos recientes:** los seis más nuevos, con cliente, fecha, total y estado. Pulsa el número para abrir un pedido, o **Ver
  todos los pedidos**.
- **Productos más vendidos** de los últimos 30 días.

A la derecha, que se queda a la vista mientras recorres la izquierda:

- **Hoy:** pedidos recibidos, pedidos pagados, ventas, impuestos y pedido promedio.
- **Alertas:** pedidos por preparar, agotados, stock bajo, mensajes fallidos y trabajos fallidos. Cada fila lleva a la lista que
  explica su número. Deberían estar en **0**, salvo los pedidos por preparar; mira
  [Mensajes y notificaciones](/admin/messages-and-notifications/).
- **Otros periodos:** ventas y pedidos pagados de los últimos 7 y 30 días.

En el celular las dos columnas se apilan en una.

![El panel en un celular](../../../assets/screens/es/admin-dashboard-phone.png)

## El menú y el buscador

La barra de arriba tiene el nombre de la tienda, un **buscador**, el botón **Menú** y **Cerrar sesión**.

- **Menú** abre todas las páginas del panel en cinco secciones: **Catálogo** (Productos, Categorías, Atributos, Multimedia,
  Inventario), **Ventas** (Pedidos, Facturas, Envíos, Reportes), **Contenido** (Páginas, Testimonios, Correos), **Mensajería**
  (WhatsApp, Registro de mensajes, Trabajos fallidos) y **Tienda** (Configuración, Usuarios). Esta guía sigue casi el mismo orden.
- El **buscador** («Ir a una página…») filtra esas páginas mientras escribes; **Enter** abre la primera. En un portátil, **Ctrl K**
  (o **⌘ K**) lleva el cursor al buscador desde cualquier página, y **Esc** cierra el menú.
- Sobre el título de cada página hay una línea con la sección y la página («Ventas / Pedidos») para saber dónde estás.

## Roles: quién puede hacer qué

Hay dos roles.

| Puede…                                                             | Editor | Propietario |
| ------------------------------------------------------------------ | :----: | :---------: |
| Gestionar productos, categorías, atributos y multimedia            |   ✔    |      ✔      |
| Gestionar pedidos y cambiar su estado                              |   ✔    |      ✔      |
| Ajustar e importar stock                                           |   ✔    |      ✔      |
| Editar páginas, testimonios y el texto de los correos              |   ✔    |      ✔      |
| Cambiar la **configuración** (impuestos, pago, WhatsApp…)          |        |      ✔      |
| Anular una factura                                                 |        |      ✔      |
| Invitar y gestionar **usuarios**                                   |        |      ✔      |
| Reintentar o descartar trabajos fallidos, conectar **WhatsApp**    |        |      ✔      |

Da el rol de Editor para el trabajo diario y reserva el de Propietario para quienes dirigen el negocio. Los permisos se
comprueban en el servidor, así que un botón oculto nunca es la única protección.
