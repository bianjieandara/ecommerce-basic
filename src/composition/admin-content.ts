// Wiring of the content administration: settings, pages, shipping methods, testimonials and users. Kept apart from the
// container, like the catalog and inventory modules, so the container stays a list of what exists.
import { CreatePage } from '@/application/content/create-page';
import { DeletePage } from '@/application/content/delete-page';
import { SavePage } from '@/application/content/save-page';
import { SaveSettings } from '@/application/content/save-settings';
import type { SettingsRepository } from '@/application/ports/content';
import type { Clock, IdGenerator } from '@/application/ports/platform';
import { D1PageRepository } from '@/infrastructure/d1/page-repository';

/** The content administration services the container exposes. */
export interface ContentAdmin {
  saveSettings: SaveSettings;
  savePage: SavePage;
  createPage: CreatePage;
  deletePage: DeletePage;
}

/** Dependencies of the content administration, built by the container. */
export interface ContentAdminDeps {
  settings: SettingsRepository;
  clock: Clock;
  ids: IdGenerator;
}

/**
 * Builds the content administration services from the Worker environment.
 * @param env Worker bindings (DB is used by the page repository).
 * @param deps Settings repository, clock and id generator.
 * @returns The wired services.
 */
export function createContentAdmin(env: Env, deps: ContentAdminDeps): ContentAdmin {
  const pages = new D1PageRepository(env.DB);
  return {
    saveSettings: new SaveSettings(deps),
    savePage: new SavePage({ pages, settings: deps.settings, clock: deps.clock }),
    createPage: new CreatePage({ pages, clock: deps.clock, ids: deps.ids }),
    deletePage: new DeletePage({ pages }),
  };
}
