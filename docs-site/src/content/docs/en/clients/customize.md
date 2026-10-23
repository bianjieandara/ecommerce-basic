---
title: Making it yours
description: What can be changed without a developer, and what needs one.
sidebar:
  order: 4
---

There are three levels. Start at the first; most stores never need the others.

## 1. In the admin (no code)

The owner and team can change all of this themselves, any time:

| To change…                          | Go to                                                        |
| ----------------------------------- | ------------------------------------------------------------ |
| Name, logo, colours, typeface       | [Settings](/en/admin/settings/) → General and Theme              |
| The home page layout and its text   | [Pages](/en/admin/pages-and-content/) → Home                     |
| About, privacy, terms, custom pages | [Pages](/en/admin/pages-and-content/)                            |
| Email wording                       | [Emails](/en/admin/emails-and-shipping/)                         |
| Delivery options and prices         | [Shipping](/en/admin/emails-and-shipping/)                       |
| Payment methods and bank details    | [Settings](/en/admin/settings/) → Checkout                       |
| Tax and invoice details             | [Settings](/en/admin/settings/) → Tax and Invoicing              |
| Who can sign in                     | [Users](/en/admin/team-and-whatsapp/)                            |

The look of the shop comes from a small set of design choices (colours, typeface, corner roundness) that apply everywhere, so the
shop stays consistent and readable on phones whatever you pick.

## 2. A client extension (a developer, a little code)

When one client needs a **special section** or **extra styling** that others should not get, a developer adds it in that client's
own folder, `clients/<name>/extensions`. The rest of the code is untouched, so updates keep working.

:::caution[Check before promising]
The folder and the wiring exist, but at the time of writing the storefront does not yet load extension sections. Ask your
developer to confirm the current state before promising a client a custom widget.
:::

## 3. New connections (a developer)

Payment providers, electronic-invoicing providers and marketing connections are **adapters**: a new one is written against the
same interface as the existing ones and plugged in, so the rest of the store does not change. This is how another card gateway or
a tax-authority invoicing service would be added for a client.

## Updating every store

Improvements to the template are published to every client in one step. Each client keeps its own settings, data and keys, and
database changes are applied automatically as part of the update.
