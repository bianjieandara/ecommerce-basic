// Renders a draft of one notification email with sample data, for the live preview in the editor. A draft with a placeholder
// the email does not allow answers 422 with the field path, the same check a save runs.
import { emailKeyFrom, previewEmailInput } from '@/application/notifications/email-schemas';
import { defineEndpoint } from '@/http/define-endpoint';

export const POST = defineEndpoint({
  method: 'POST',
  input: previewEmailInput,
  handler: ({ input, context }) =>
    context.locals.app.emailTemplates.preview(emailKeyFrom(context.params.key ?? ''), input.locale, {
      subject: input.subject,
      body: input.body,
    }),
});
