---
title: Operating the store
description: Day-to-day health, security and the limits to know about.
sidebar:
  order: 5
---

## What to look at, and how often

| Where                                           | Look for                                       | How often          |
| ----------------------------------------------- | ---------------------------------------------- | ------------------ |
| [Dashboard](/admin/overview/)                   | Orders to process, out of stock, unread messages | Every working day  |
| **Failed jobs** and **Message log**             | Anything failed or skipped for a bad reason    | Daily at first, then weekly |
| [Reports](/admin/reports/)                      | Sales, best sellers, stock to reorder          | Weekly             |
| Payment provider dashboards                     | Disputes and refunds                           | Weekly             |

A healthy store shows **0** failed jobs and **0** failed messages. Both are one click away from the cause.

## Security in plain words

- **Bots and abuse:** forms use invisible bot checks and limits on repeated attempts; the admin sign-in is protected the same way.
- **Payments:** the store never sees card numbers. Payment confirmations are checked cryptographically before an order is marked
  paid, and the store asks the provider for the real status instead of trusting the message.
- **Orders and invoices:** each customer link carries a private key; without it the order cannot be opened.
- **Admin:** two roles, passwords stored as hashes, sessions that expire, and every action checked on the server.
- **Browser protections:** the shop cannot be framed by other sites and sends only the necessary referrer information.

The detailed threat list and checklist for developers is `docs/SECURITY.md` in the repository.

## Limits to know

Each Cloudflare account has limits that matter only when one account hosts many stores: about 500 Workers, 1,000 KV namespaces,
10,000 queues and **250 scheduled tasks**, which means at most about **250 stores per account**. Usage that is shared in an
account (emails, invoice-PDF browser hours, database operations) is watched in the Cloudflare dashboard. When an account gets
close to a limit, the biggest stores are moved to accounts of their own.

## Updates and support

The agency updates the template and publishes it to every store, usually without any action from you. If something looks wrong,
send the order number or page address, what you expected and a screenshot; the [message log](/admin/messages-and-notifications/)
and the order timeline usually show what happened.
