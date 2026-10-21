// Email shell: table-based layout with inline styles, so it renders the same in mail clients that ignore CSS.
// The body is already-rendered HTML; the layout only adds the store header, the button colour and the footer.
import { attrs, escapeHtml } from './html';
import type { Locale } from '@/domain/shared/locale';

/** Values the email shell needs from the store. */
export interface EmailLayoutInput {
  bodyHtml: string;
  preheader: string;
  storeName: string;
  logoUrl: string | null;
  primaryColor: string;
  footerText: string;
  contactEmail: string;
  locale: Locale;
}

/**
 * Wraps a rendered body in the store's email shell.
 * @param input Body and store values.
 * @returns A complete HTML document.
 */
export function renderEmailLayout(input: EmailLayoutInput): string {
  const logo = input.logoUrl
    ? `<img${attrs({ src: input.logoUrl, alt: input.storeName, height: 40 })} style="display:block;height:40px;border:0" />`
    : `<span style="font:600 18px Arial,sans-serif;color:#111111">${escapeHtml(input.storeName)}</span>`;
  return `<!doctype html>
<html lang="${input.locale}">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(input.storeName)}</title></head>
<body style="margin:0;padding:0;background:#f5f5f5">
<span style="display:none;max-height:0;overflow:hidden">${escapeHtml(input.preheader)}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:24px 12px">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:8px">
<tr><td style="padding:20px 24px;border-bottom:1px solid #eeeeee">${logo}</td></tr>
<tr><td style="padding:24px;font:16px/1.5 Arial,sans-serif;color:#111111">${input.bodyHtml}</td></tr>
<tr><td style="padding:16px 24px;font:12px/1.5 Arial,sans-serif;color:#666666;border-top:1px solid #eeeeee">
${escapeHtml(input.footerText)}<br>
<a href="mailto:${escapeHtml(input.contactEmail)}" style="color:${escapeHtml(input.primaryColor)}">${escapeHtml(input.contactEmail)}</a>
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
}

/**
 * Button-shaped link for emails (bulletproof: a table cell with the colour and the link).
 * @param label Visible text.
 * @param href Absolute URL.
 * @param color Button colour.
 * @returns Table markup.
 */
export function emailButton(label: string, href: string, color: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:16px 0"><tr><td style="border-radius:6px;background:${escapeHtml(color)}">
<a href="${escapeHtml(href)}" style="display:inline-block;padding:12px 20px;font:600 15px Arial,sans-serif;color:#ffffff;text-decoration:none">${escapeHtml(label)}</a>
</td></tr></table>`;
}
