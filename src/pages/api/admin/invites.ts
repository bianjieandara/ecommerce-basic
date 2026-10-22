// Admin invitations. Only owners may invite; the use case checks that. The invitee sets their own password from the emailed
// link, so the owner never handles it.
import { inviteAdminInput } from '@/application/identity/schemas';
import { DomainError } from '@/domain/shared/errors';
import { defineEndpoint } from '@/http/define-endpoint';

/** Invites another admin. Only owners may invite. */
export const POST = defineEndpoint({
  method: 'POST',
  input: inviteAdminInput,
  handler: async ({ input, context }) => {
    const actor = context.locals.admin;
    if (!actor) throw new DomainError('UNAUTHORIZED', 'Please sign in to continue.');
    const user = await context.locals.app.inviteAdmin.execute(actor, input);
    return { user };
  },
});
