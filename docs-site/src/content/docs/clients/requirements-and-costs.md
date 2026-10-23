---
title: What you bring, and what it costs
description: The accounts, content and monthly costs behind a store.
sidebar:
  order: 2
---

## What you bring

| Item                          | Why                                                                                          |
| ----------------------------- | -------------------------------------------------------------------------------------------- |
| **A domain name**             | The address of the shop, for example `shop.yourbrand.com`. A subdomain of your main site is fine. |
| **Your business details**     | Legal name, tax ID, address and tax rate, for invoices.                                        |
| **Products and pictures**     | Names, descriptions, prices, stock, and good photos (square, at least 1000 px).                 |
| **Payment accounts**          | A **dLocal Go** account for cards and a **PayPal Business** account. Start in their test mode.   |
| **A sending email address**   | On a domain you own, so order emails are trusted by Gmail and Outlook.                          |
| **Legal texts**               | The store includes templates for the privacy policy, terms, and shipping and returns. Have them reviewed for your country and business. |
| *(Optional)* **WhatsApp**     | A Meta Business account and a phone number not used in the regular WhatsApp app.                |
| *(Optional)* **Meta ads**     | A Meta Pixel and, for server-side tracking, a Conversions API token.                            |

## Where the store runs

On **Cloudflare**. Either on the agency's Cloudflare account (the simplest: it is included in the service) or on **your own**
Cloudflare account, in which case the usage is billed to you and you keep full ownership. Each store has its own database, picture
storage, task queue and analytics, so moving one to another account is possible.

## What it costs to run

The platform is deliberately cheap to run because it uses pay-for-what-you-use services. Figures below come from the project plan;
check Cloudflare's current pricing before quoting a client.

| Cost                          | Typical                                                                                                  |
| ----------------------------- | -------------------------------------------------------------------------------------------------------- |
| **Cloudflare Workers plan**   | About **US$5 per month per account**. On the agency account one plan covers many stores.                  |
| **Included usage**            | Database reads and writes, 3,000 emails a month and 10 browser-hours a month (for invoice PDFs) are included per account and shared by its stores; beyond that, usage is a few cents per thousand. |
| **Picture storage**           | 10 GB free, and no charge for downloads.                                                                 |
| **Domain**                    | Your registrar's yearly price.                                                                           |
| **Card and PayPal fees**      | Charged by the providers per sale. The store adds nothing.                                               |
| **WhatsApp**                  | Meta charges per template message sent, by category and country. Email has no such fee.                   |

A small shop typically stays inside the included usage, so the running cost is dominated by the domain and the payment fees.
