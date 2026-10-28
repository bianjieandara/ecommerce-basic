---
title: Mensajes y notificaciones
description: El registro de todo lo que la tienda envía y qué hacer cuando algo falla.
sidebar:
  order: 7
---

Todo lo que la tienda envía queda anotado, y lo que no se pudo enviar también, con su motivo. Es la pantalla a la que vas cuando
un cliente dice que no le llegó nada.

## El registro de mensajes

**Registro de mensajes** lista cada correo y cada mensaje de WhatsApp que la tienda intentó enviar: cuándo, por qué canal, qué
mensaje, a quién y en qué estado está: *En cola*, *Enviado*, *Entregado*, *Leído*, *Fallido* u *Omitido*.

![Lista de envíos con la fecha, el canal, el destinatario y el estado de cada uno](../../../assets/screens/es/admin-notification-log.png)

Un mensaje puede **omitirse** a propósito, por ejemplo un WhatsApp a alguien que no lo aceptó; se muestra el motivo. Un mensaje
**fallido** tiene un botón **Enviar de nuevo** una vez que arreglaste la causa (casi siempre una dirección de remitente incorrecta o
una clave vencida). Solo los propietarios pueden reenviar.

:::tip
Cuando un cliente dice «no me llegó el correo», busca su dirección en el registro. Muestra si la tienda lo envió y cuándo.
:::

## Trabajos fallidos

Parte del trabajo ocurre en segundo plano: enviar un correo, generar el PDF de una factura, revisar alertas de stock. Si una tarea
sigue fallando después de varios reintentos automáticos, queda aparcada en **Trabajos fallidos** en lugar de perderse. Los
**propietarios** pueden **Reintentar** un trabajo cuando el problema está resuelto o **Descartarlo** cuando ya no importa. Arriba se
indica además cuántas tareas están **en espera en la cola**.

![Tareas aparcadas, con los botones Reintentar y Descartar y el número de tareas en espera](../../../assets/screens/es/admin-jobs.png)

La tarjeta **Trabajos fallidos** del panel debería marcar **0**. Un número distinto significa que algo necesita atención.
