// Wiring of the content administration: settings, pages, shipping methods, testimonials, emails and users. Kept apart from the
// container, like the catalog and inventory modules, so the container stays a list of what exists.
import { CreatePage } from '@/application/content/create-page';
import { DeletePage } from '@/application/content/delete-page';
import { ManageTestimonials } from '@/application/content/manage-testimonials';
import { SavePage } from '@/application/content/save-page';
import { SaveSettings } from '@/application/content/save-settings';
import type { SettingsRepository } from '@/application/ports/content';
import type { Clock, IdGenerator } from '@/application/ports/platform';
import { ManageShipping } from '@/application/ordering/manage-shipping';
import { ManageUsers } from '@/application/identity/manage-users';
import type { EmailTemplateService } from '@/application/notifications/email-template-service';
import { SendEmailTest } from '@/application/notifications/send-email-test';
import type { NotificationService } from '@/application/notifications/notification-service';
import { D1AdminUserRepository, D1SessionRepository } from '@/infrastructure/d1/identity-repositories';
import { D1PageRepository } from '@/infrastructure/d1/page-repository';
import { D1ShippingMethodRepository } from '@/infrastructure/d1/shipping-repository';
import { D1TestimonialRepository } from '@/infrastructure/d1/testimonial-repository';

/** The content administration services the container exposes. */
export interface ContentAdmin {
  saveSettings: SaveSettings;
  savePage: SavePage;
  createPage: CreatePage;
  deletePage: DeletePage;
  manageShipping: ManageShipping;
  manageTestimonials: ManageTestimonials;
  manageUsers: ManageUsers;
  sendEmailTest: SendEmailTest;
}

/** Dependencies of the content administration, built by the container. */
export interface ContentAdminDeps {
  settings: SettingsRepository;
  clock: Clock;
  ids: IdGenerator;
  notifications: NotificationService;
  emailTemplates: EmailTemplateService;
}

/**
 * Builds the content administration services from the Worker environment.
 * @param env Worker bindings (DB is used by the repositories).
 * @param deps Settings repository, clock, id generator and the notification services.
 * @returns The wired services.
 */
export function createContentAdmin(env: Env, deps: ContentAdminDeps): ContentAdmin {
  const pages = new D1PageRepository(env.DB);
  const shipping = new D1ShippingMethodRepository(env.DB);
  const testimonials = new D1TestimonialRepository(env.DB);
  return {
    saveSettings: new SaveSettings(deps),
    savePage: new SavePage({ pages, settings: deps.settings, clock: deps.clock }),
    createPage: new CreatePage({ pages, clock: deps.clock, ids: deps.ids }),
    deletePage: new DeletePage({ pages }),
    manageShipping: new ManageShipping({ shipping, ids: deps.ids }),
    manageTestimonials: new ManageTestimonials({ testimonials, ids: deps.ids, clock: deps.clock }),
    manageUsers: new ManageUsers({
      users: new D1AdminUserRepository(env.DB),
      sessions: new D1SessionRepository(env.DB),
      clock: deps.clock,
    }),
    sendEmailTest: new SendEmailTest({
      templates: deps.emailTemplates,
      notifications: deps.notifications,
      ids: deps.ids,
    }),
  };
}
