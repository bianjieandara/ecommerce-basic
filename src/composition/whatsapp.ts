// Wiring of WhatsApp: the Meta client, the templates and their approval, the message sender, and the webhook. Kept apart from
// the container, like the other modules, so the container stays a list of what exists.
import type { JobHandler } from '@/application/jobs/dispatcher';
import type { JobQueue } from '@/application/ports/jobs';
import type { SettingsRepository } from '@/application/ports/content';
import type { AttachmentLoader, NotificationLogRepository } from '@/application/ports/notifications';
import type { Clock, IdGenerator } from '@/application/ports/platform';
import { WhatsAppTemplateService } from '@/application/notifications/whatsapp-template-service';
import { WhatsAppMetaSync } from '@/application/notifications/whatsapp/meta-sync';
import { ReceiveWhatsAppWebhook } from '@/application/notifications/whatsapp/receive-whatsapp-webhook';
import { handleNotifyWhatsapp } from '@/application/notifications/whatsapp/handle-notify-whatsapp';
import {
  D1WhatsAppStatusRepository,
  D1WhatsAppTemplateRepository,
} from '@/infrastructure/d1/whatsapp-template-repository';
import { MetaGraphClient } from '@/infrastructure/meta/graph-client';
import { connectionStatusOf, readMetaSettings } from '@/infrastructure/meta/meta-config';
import { MetaWebhookAuth } from '@/infrastructure/meta/meta-signature';
import { WhatsAppCloudSender } from '@/infrastructure/meta/whatsapp-cloud-sender';
import { MetaTemplateCatalog } from '@/infrastructure/meta/whatsapp-template-catalog';
import { logEvent } from '@/infrastructure/system/logger';

/** The WhatsApp services the container exposes: admin templates, Meta submit and sync, and the webhook. */
export interface WhatsAppServices {
  templates: WhatsAppTemplateService;
  metaSync: WhatsAppMetaSync;
  webhook: ReceiveWhatsAppWebhook;
}

/** Dependencies of the WhatsApp wiring, built by the container. */
export interface WhatsAppDeps {
  settings: SettingsRepository;
  logs: NotificationLogRepository;
  jobs: JobQueue;
  /** The same attachment loader the email sender uses, so a PDF is read the same way in both channels. */
  attachments: AttachmentLoader;
  clock: Clock;
  ids: IdGenerator;
  siteUrl: string;
}

/**
 * Builds the WhatsApp services and the notify.whatsapp job handler. The Meta settings are read once per container.
 * @param env Worker bindings (DB is used by the repositories).
 * @param deps Repositories, clock, ids and the attachment loader.
 * @returns The services for the container and the handler for the job map.
 */
export function createWhatsApp(
  env: Env,
  deps: WhatsAppDeps,
): { services: WhatsAppServices; notifyWhatsapp: JobHandler } {
  const meta = readMetaSettings();
  const graph = new MetaGraphClient({ version: meta.graphVersion, token: meta.token });
  const templates = new D1WhatsAppTemplateRepository(env.DB);
  const sender = new WhatsAppCloudSender(graph, meta.phoneNumberId);
  const catalog = new MetaTemplateCatalog(graph, meta.wabaId, meta.appId);
  const report = (event: string, data: Record<string, unknown>) => logEvent(event, data);
  return {
    services: {
      templates: new WhatsAppTemplateService({
        templates,
        settings: deps.settings,
        connection: { status: () => connectionStatusOf(meta) },
        logs: deps.logs,
        jobs: deps.jobs,
        clock: deps.clock,
        ids: deps.ids,
        siteUrl: deps.siteUrl,
      }),
      metaSync: new WhatsAppMetaSync({
        templates,
        settings: deps.settings,
        catalog,
        clock: deps.clock,
        siteUrl: deps.siteUrl,
      }),
      webhook: new ReceiveWhatsAppWebhook({
        auth: new MetaWebhookAuth(meta.verifyToken, meta.appSecret),
        statuses: new D1WhatsAppStatusRepository(env.DB),
        clock: deps.clock,
      }),
    },
    notifyWhatsapp: handleNotifyWhatsapp({
      templates,
      settings: deps.settings,
      logs: deps.logs,
      sender,
      attachments: deps.attachments,
      clock: deps.clock,
      report,
    }),
  };
}
