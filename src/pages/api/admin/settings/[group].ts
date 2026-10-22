// Saves one settings group from the settings form. The use case checks the permission and the group's schema.
import { z } from 'zod';
import { parseSettingsGroup } from '@/application/content/save-settings';
import { requireAdmin } from '@/http/admin-session';
import { defineEndpoint } from '@/http/define-endpoint';

const saveSettingsInput = z.object({ values: z.unknown() });

export const POST = defineEndpoint({
  method: 'POST',
  input: saveSettingsInput,
  invalidatesCache: true,
  handler: ({ input, context }) =>
    context.locals.app.contentAdmin.saveSettings.execute(
      requireAdmin(context.locals.admin),
      parseSettingsGroup(context.params.group ?? ''),
      input.values,
    ),
});
