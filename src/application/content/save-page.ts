// Saves a page from the page builder. Each section must name a widget that exists, and its settings must pass that widget's
// fields, so the storefront only ever renders what the registry knows and what its schema accepts.
import { can } from '@/domain/identity/role';
import { DomainError } from '@/domain/shared/errors';
import type { Page } from '@/domain/content/page';
import { fieldsToSchema, issueCode, type FieldIssue } from '../forms/fields-to-schema';
import type { PageRepository, SettingsRepository } from '../ports/content';
import type { AdminUser } from '../ports/identity';
import type { Clock } from '../ports/platform';
import { findWidgetDefinition } from './widgets/registry';
import { findEditablePage } from './system-page-view';
import type { SavePageInput } from './page-schemas';

/** Dependencies of the page save. */
export interface SavePageDeps {
  pages: PageRepository;
  settings: SettingsRepository;
  clock: Clock;
}

/** Saves the texts, the publication and the sections of a page. */
export class SavePage {
  /** @param deps Page and settings repositories, and the clock. */
  constructor(private readonly deps: SavePageDeps) {}

  /**
   * Validates the page and stores it.
   * @param actor The signed-in admin.
   * @param id Page to save.
   * @param input Texts, publication and sections from the builder.
   * @returns The saved page.
   * @throws DomainError FORBIDDEN, NOT_FOUND, or VALIDATION_FAILED with the issues by path.
   */
  async execute(actor: AdminUser, id: string, input: SavePageInput): Promise<Page> {
    if (!can(actor.role, 'content.edit')) {
      throw new DomainError('FORBIDDEN', 'You do not have permission to do this.');
    }
    const page = await findEditablePage(this.deps.pages, id, this.deps.clock.now().toISOString());
    if (!page) throw new DomainError('NOT_FOUND', 'Page not found');
    const { defaultLocale } = await this.deps.settings.get('general');
    const issues: FieldIssue[] = [];
    if (!input.title[defaultLocale]) {
      issues.push({ path: `title.${defaultLocale}`, code: 'REQUIRED', message: 'Required' });
    }

    const sections: Page['sections'] = [];
    const seenIds = new Set<string>();
    input.sections.forEach((section, index) => {
      const definition = findWidgetDefinition(section.type);
      if (!definition) {
        issues.push({ path: `sections.${index}.type`, code: 'UNKNOWN_BLOCK', message: 'Unknown block' });
        return;
      }
      if (seenIds.has(section.id)) {
        issues.push({ path: `sections.${index}.id`, code: 'DUPLICATE_BLOCK', message: 'Duplicate block' });
      }
      seenIds.add(section.id);
      const parsed = fieldsToSchema(definition.fields, { defaultLocale }).safeParse(section.config);
      if (!parsed.success) {
        for (const issue of parsed.error.issues) {
          issues.push({
            path: `sections.${index}.config.${issue.path.join('.')}`,
            code: issueCode(issue),
            message: issue.message,
          });
        }
        return;
      }
      sections.push({ id: section.id, type: section.type, enabled: section.enabled, config: parsed.data });
    });
    if (issues.length > 0)
      throw new DomainError('VALIDATION_FAILED', 'Some page fields are not valid', { issues });

    const saved: Page = {
      ...page,
      title: input.title,
      seoTitle: input.seoTitle,
      seoDescription: input.seoDescription,
      isPublished: input.isPublished,
      sections,
      updatedAt: this.deps.clock.now().toISOString(),
    };
    await this.deps.pages.save(saved);
    return saved;
  }
}
