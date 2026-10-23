---
title: Launching a store
description: The steps from a signed agreement to a live, tested shop.
sidebar:
  order: 3
---

The technical steps are done by the agency (or your developer) and are written in full in the repository's `docs/NEW_CLIENT.md`.
This page is the overview, so you know what happens and what is asked of you.

## The path

1. **Gather** the items in [What you bring](/en/clients/requirements-and-costs/).
2. **Create the store's resources.** One command creates the store's database, storage, cache and task queues on Cloudflare and
   a configuration file for the client.
3. **Configure the store.** The address, the sender email, the payment mode (test or live) and the bot-protection key.
4. **Connect the services** (below).
5. **Deploy.** The store is built and published, and the database is prepared.
6. **First sign-in.** The first **owner** account is created once at `/admin/setup` with a private setup code, and the code is then
   removed.
7. **Fill the shop**: settings, products, pages, shipping, email wording. This is where the owner spends most of the time.
8. **Test**, then **go live** by switching payments from test to live keys.

## Connecting the services

### Domain and bot protection

The shop's hostname is added to the store, and a Cloudflare **Turnstile** widget is created for it. Turnstile is free and invisible
to shoppers.

### Email

Add your sending domain to Cloudflare's Email Service and use an address on it as the sender, so messages are authenticated.

### Payments

- **Card (dLocal Go):** an API key and a secret key. The store registers a notification address at `/api/webhooks/dlocalgo` so
  dLocal Go can tell it a payment succeeded.
- **PayPal:** a client ID and secret, and a webhook at `/api/webhooks/paypal`.

Start with the **test** keys of each provider, run a purchase with each, and only then switch to the live keys.

### WhatsApp (optional)

Create a Meta Business account and a Meta app with the WhatsApp product, note the phone number ID and the business account ID, and
create a permanent token. The store submits its message templates to Meta, and Meta approves them (often within minutes to a day).
Nothing is sent to customers until a template is approved and the customer agreed to receive messages.

### Meta Pixel and catalog (optional)

Add your Pixel ID in [Settings](/en/admin/settings/) (Marketing). Tracking starts only after the visitor accepts cookies.

## Test before you launch

Go through this list on the real address, with test payments. The step by step for each service is in
[Test with test accounts](/en/clients/test-accounts/):

- [ ] The shop loads in `/es` and `/en`, on a phone and a laptop.
- [ ] `/admin` asks for a sign-in, and the owner can sign in.
- [ ] A **card** purchase in test mode reaches **Paid**, the customer email arrives, and an **invoice** is issued.
- [ ] A **PayPal** purchase in test mode reaches **Paid**.
- [ ] A **bank transfer** order shows your bank details and can be marked paid by hand.
- [ ] A product that is out of stock cannot be bought, and shows the back-in-stock option.
- [ ] The **Contact** page shows your WhatsApp, email, phone and address, and each card opens what it should (chat, email, call).
- [ ] The privacy policy, terms and shipping pages say what is true for your business.
- [ ] The dashboard shows **0** failed jobs and **0** failed messages.

## After launch

Change the payment keys to **live**, make a small real purchase yourself and refund it, and keep an eye on the
[message log](/en/admin/messages-and-notifications/) and the dashboard for the first few days.
