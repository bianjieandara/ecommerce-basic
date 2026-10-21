// Emails sent to people who administer the store: password resets and invitations.
import type { EmailDefinition } from './definition';

type AdminEmailKey = 'admin_password_reset' | 'admin_invite';

/** Admin emails, by key. */
export const ADMIN_EMAILS: Record<AdminEmailKey, EmailDefinition> = {
  admin_password_reset: {
    key: 'admin_password_reset',
    audience: 'admin',
    label: 'Password reset',
    description: 'Sent when an admin asks for a new password. The link expires in 30 minutes.',
    variables: ['admin.name'],
    blocks: ['resetButton'],
    defaults: {
      es: {
        subject: 'Restablece tu contraseña de {{store.name}}',
        body: `Hola {{admin.name}}, recibimos una solicitud para restablecer tu contraseña. El enlace vence en 30 minutos. Si no fuiste tú, ignora este correo.

{{block:resetButton}}`,
      },
      en: {
        subject: 'Reset your {{store.name}} password',
        body: `Hi {{admin.name}}, we received a request to reset your password. The link expires in 30 minutes. If it was not you, ignore this email.

{{block:resetButton}}`,
      },
    },
  },

  admin_invite: {
    key: 'admin_invite',
    audience: 'admin',
    label: 'Admin invitation',
    description: 'Sent when an owner invites someone to manage the store.',
    variables: ['admin.name', 'admin.inviterName'],
    blocks: ['inviteButton'],
    defaults: {
      es: {
        subject: 'Te invitaron a administrar {{store.name}}',
        body: `Hola {{admin.name}}, {{admin.inviterName}} te invitó a administrar la tienda. Crea tu contraseña para empezar.

{{block:inviteButton}}`,
      },
      en: {
        subject: 'You were invited to manage {{store.name}}',
        body: `Hi {{admin.name}}, {{admin.inviterName}} invited you to manage the store. Create your password to get started.

{{block:inviteButton}}`,
      },
    },
  },
};
