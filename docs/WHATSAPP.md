# WhatsApp setup (Meta Cloud API)

WhatsApp messages are template messages: Meta approves each template before the store can send it. The store keeps one
template per message key (see `application/notifications/whatsapp/`), and the admin screen `/admin/whatsapp` (owners only)
submits them, syncs their status and sends test messages.

Nothing is sent until all of these are true: WhatsApp is on in settings (`whatsapp.enabled`), the connection to Meta is set,
the message is enabled in `/admin/whatsapp`, and Meta has approved the template in the recipient's language. Anything else is
logged as **skipped** with the reason, in `/admin/notification-log`.

## 1. Meta accounts (the store owner does these)

1. Create a **Meta Business** account and verify it (Business Manager).
2. Create a **Meta app** of type Business and add the **WhatsApp** product.
3. In WhatsApp > API setup, note:
   - **Phone number ID** (`WHATSAPP_PHONE_NUMBER_ID`). Use a number that is not registered in the WhatsApp app.
   - **WhatsApp Business Account ID** (`WHATSAPP_WABA_ID`).
4. Create a **system user** (Business settings > Users > System users, role Admin) and generate a **permanent token** with
   `whatsapp_business_messaging` and `whatsapp_business_management`, assigned to the WhatsApp Business Account and the app.
   This is `WHATSAPP_TOKEN`. Never share it or commit it.
5. App settings > Basic: the **App secret** (`META_APP_SECRET`) signs every webhook delivery.
6. Only for templates with a PDF header (invoices): the **App ID** (`META_APP_ID`). Meta needs it to upload the sample file
   that the template header is reviewed against.
7. Graph API version (`META_GRAPH_VERSION`): use a current version from the Meta changelog, such as `v2x.0`. The store does
   not pin one; check the value when you set it up.

## 2. Settings and secrets

| Name                       | Where                                                         | Value                                                               |
| -------------------------- | ------------------------------------------------------------- | ------------------------------------------------------------------- |
| `META_GRAPH_VERSION`       | `clients/<slug>/client.jsonc` vars                            | Graph API version, for example `v21.0`                              |
| `WHATSAPP_PHONE_NUMBER_ID` | client vars                                                   | Phone number ID                                                     |
| `WHATSAPP_WABA_ID`         | client vars                                                   | Business Account ID                                                 |
| `WHATSAPP_TOKEN`           | secret (`.dev.vars` locally, `wrangler secret` in production) | System-user token                                                   |
| `META_APP_SECRET`          | secret                                                        | App secret                                                          |
| `META_APP_ID`              | var or secret                                                 | App ID (PDF templates only)                                         |
| `WHATSAPP_VERIFY_TOKEN`    | secret                                                        | A random string you choose, for example from `openssl rand -hex 24` |

Local development: put the secrets in `.dev.vars` and the ids in the client file, then restart the dev server. The admin screen
shows only whether each setting is set; values are never displayed or logged.

## 3. Webhook

In the Meta app > WhatsApp > Configuration:

- **Callback URL**: `https://<your-domain>/api/webhooks/whatsapp`
- **Verify token**: the value of `WHATSAPP_VERIFY_TOKEN`
- **Webhook fields**: subscribe to `messages` (required for status updates) and `message_template_status_update`
  (review results).

Meta calls the URL with `hub.challenge` to verify it. Each delivery is signed with `X-Hub-Signature-256`; unsigned or
wrongly signed deliveries are refused with 403. Delivery statuses (`sent`, `delivered`, `read`, `failed`) update the
notification log for the message they belong to. Incoming customer messages are acknowledged and not stored yet (the inbox
is backlog).

Local development: Meta cannot reach `localhost`. Use a tunnel (for example `cloudflared tunnel --url http://localhost:4321`)
and set the tunnel URL as the callback URL while you test.

## 4. Templates

1. Open `/admin/whatsapp`. Each message has its default text in Spanish and English, its parameters (the values it fills
   into `{{1}}`, `{{2}}`, ...), an optional link button and, for invoices, a PDF header.
2. Edit the text if needed. Keep the placeholders in order, one for each parameter, and start and end the text with words.
3. Press **Submit to Meta**. Each language is created in Meta under the same name, category UTILITY. Meta reviews the
   template, usually within minutes to a day.
4. Press **Sync status** later to read the review result. A rejected template shows Meta's reason.
5. Turn **Send this message** on once a language is approved.
6. Press **Send test to me** to receive a sample. The account's phone number is used; add it to your admin profile first.

Rules:

- An approved template is read only. To change its text or variables, give it a new **Meta name** and submit it again.
  The old template stays in Meta.
- A rejected or pending template cannot be sent. Submit it again under a new name after you change it.
- Do not use WhatsApp for marketing messages. The store's templates are UTILITY (order and stock updates); marketing
  needs a different category and a different opt-in.

## 5. Opt-in and recipients

- Customers receive WhatsApp messages only after they opted in: the checkout option (`whatsappOptInDefault` and the checkbox)
  or the back-in-stock form. A message to a customer without an opt-in is not queued.
- Store alerts (new order, low stock, weekly report) go to the alerts number in settings (`whatsapp.alertsNumber`), with the
  default country code (`whatsapp.defaultCountryCode`) added when the number has none.
- Phone numbers are stored as digits with the country code, the format Meta expects.

## 6. Costs

Meta charges per template message sent to a customer, by category and country. Free-form replies within the customer
service window are not used by the store. Check the current price list in Meta's WhatsApp pricing page before you enable
a message. Messages that are skipped or fail are not charged.

## 7. Troubleshooting

| Symptom                                          | Check                                                                    |
| ------------------------------------------------ | ------------------------------------------------------------------------ |
| Log row says "WhatsApp is not connected to Meta" | Connection panel: a setting is missing                                   |
| "Template not approved for es (PENDING)"         | Wait for Meta, then **Sync status**                                      |
| "Template disabled by the store"                 | Turn **Send this message** on                                            |
| "Invalid WhatsApp number"                        | The customer's phone has no country code; fix the number and resend      |
| Delivery stays "sent"                            | Subscribe to `messages` in the webhook fields and check the callback URL |
| Webhook answers 403                              | `WHATSAPP_VERIFY_TOKEN` or `META_APP_SECRET` differs from the Meta app   |
