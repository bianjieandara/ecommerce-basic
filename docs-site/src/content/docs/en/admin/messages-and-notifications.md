---
title: Messages and notifications
description: The log of everything the store sends, and what to do when something fails.
sidebar:
  order: 7
---

Everything the store sends is logged, and so is everything it could not send, with the reason. This is the screen you open when a
customer says nothing ever arrived.

## The message log

**Message log** lists every email and every WhatsApp message the store tried to send: when, through which channel, which message,
to whom, and whether it is *Queued*, *Sent*, *Delivered*, *Read*, *Failed* or *Skipped*.

![A list of sent messages with each one's date, channel, recipient and status](../../../../assets/screens/en/admin-notification-log.png)

A message can be **skipped** on purpose, for example a WhatsApp message to someone who did not opt in. The reason is shown. A
message that **failed** has a **Retry** button once you have fixed the cause (usually a wrong sender address or an expired key).
Only owners can retry.

:::tip
When a customer says "I never got my email", search the log for their address. It shows whether the store sent it, and when.
:::

## Failed jobs

Some work happens in the background: sending an email, building an invoice PDF, checking stock alerts. If a task keeps failing
after several automatic retries, it is parked under **Failed jobs** instead of being lost. **Owners** can **Retry** a job once the
problem is fixed or **Discard** it when it no longer matters.

![Parked tasks, with the Retry and Discard buttons and the number of tasks still queued](../../../../assets/screens/en/admin-jobs.png)

The dashboard card **Failed jobs** should read **0**. A number there means something needs a look.
