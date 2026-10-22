// CSV stock import. One request either previews a file (dryRun '1') or applies it (dryRun '0'), so the preview is the
// import's own check of the file.
import { importStockInput } from '@/application/inventory/schemas';
import { requireAdmin } from '@/http/admin-session';
import { defineEndpoint } from '@/http/define-endpoint';

export const POST = defineEndpoint({
  method: 'POST',
  body: 'form',
  input: importStockInput,
  invalidatesCache: true,
  handler: async ({ input, context }) =>
    context.locals.app.inventory.importStock.execute(
      await input.file.text(),
      requireAdmin(context.locals.admin).id,
      { dryRun: input.dryRun === '1' },
    ),
});
