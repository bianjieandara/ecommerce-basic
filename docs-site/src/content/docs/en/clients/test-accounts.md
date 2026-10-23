---
title: Test with test accounts
description: How to check payments, email, WhatsApp and tracking without spending money or messaging real customers.
sidebar:
  order: 3.5
---

Before the store opens, every service is tried in its **test mode**. Nothing below charges real money or writes to real customers.
This page is the step by step; the short checklist to tick is in [Launching a store](/en/clients/launch/).

:::tip[How long it takes]
Payments and email take an afternoon. WhatsApp depends on Meta approving the templates (up to 24 hours). Meta tracking is
confirmed the next day, when Meta has shown the events.
:::

## Card payments (dLocal Go)

1. Create a test account at dLocal Go and copy the **sandbox API key** and **sandbox secret key** (Integrations > API). Test and
   live keys are different.
2. Place an order in your store and choose card. On the dLocal Go page use a test card, with any future expiry date and any
   security code:

| Card                  | Result you will see            |
| --------------------- | ------------------------------ |
| 4111 1111 1111 1111   | Approved                       |
| 4242 4242 4242 4242   | Approved                       |
| 5555 5555 5555 4444   | Rejected by the bank           |
| 4000 0566 5566 5556   | Insufficient funds             |
| 5186 0017 0000 9726   | Card expired                   |
| 5105 1051 0510 5100   | Invalid security code          |

3. With an approved card, open the order in the admin: it must be **Paid**, with its **invoice**, and the customer must receive the
   email.
4. With a rejected card, the order must stay **Pending payment** and the customer can try again.

## PayPal

1. In the PayPal developer dashboard open **Sandbox > Accounts**. A sample business account and a personal (buyer) account already
   exist; you can create more.
2. Put the test app's client ID and secret in the store.
3. Place an order with PayPal. When PayPal opens, sign in with the **personal test account** and approve. When you come back, the
   order must be **Paid**.
4. Refunds are made in PayPal (the transaction's page), then the order is marked **Refunded** in the admin.

## Email

1. Add your sending domain in Cloudflare (Email Service). The DNS records take 5 to 15 minutes.
2. Until the domain is ready, mail goes only to verified addresses of your account.
3. Place a test order and check the inbox **and** the spam folder. In the admin, **Emails** has a preview of each message in both
   languages and a button to send yourself a test.

## WhatsApp (if you use it)

1. In the Meta app, **WhatsApp > API Setup** gives you a free test number. Add your own phone as a recipient and send the sample
   `hello_world` message to confirm everything connects.
2. In the admin, **WhatsApp**: review each template's text, **Submit to Meta**, then **Sync status**. Meta answers within up to 24
   hours. If it rejects one, the reason shows there.
3. With the template approved, press **Send test**. Then mark an order as shipped and check the message carries the tracking code
   and the order link.
4. In **Messages and notifications** you should see the status go from sent to delivered and read.

Only customers who gave permission at checkout are messaged. Meta charges for each template message delivered; read its current
price list before doing the sums.

## Meta Pixel and catalog (if you use them)

1. In Meta Events Manager open **Test events** and copy the test code. Paste it in [Settings](/en/admin/settings/) > Marketing,
   next to the Pixel ID.
2. Open your store in a private window: until you accept cookies, **nothing** must be sent to Meta. Accept and walk through the
   store: view a product, add it to the cart, start checkout, pay.
3. Each step must appear in **Test events** twice, once from the browser and once from the server, and Meta must count them as one
   event.
4. **Remove the test code before launch.** With the code set, events still count for your ads.
5. Catalog: in Commerce Manager create a data source with your catalog address (`/feeds/products.xml`). Its diagnostics section
   shows which products have errors.

## If something does not work

| What you see                             | What it usually is                                                              |
| ---------------------------------------- | ------------------------------------------------------------------------------- |
| Paid, but the order does not change      | The provider could not notify the store: the store address is not public or is mistyped |
| The email does not arrive                | The domain is not verified yet, or it is in spam                                |
| WhatsApp says "skipped"                  | The template is not approved in that language, or it is switched off            |
| Meta shows no events                     | The visitor did not accept cookies, or the Pixel ID is wrong                    |

Technical details and error codes are in `docs/TESTING_INTEGRATIONS.md` in the repository.
