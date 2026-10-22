// WhatsApp template catalog: reads and creates the message templates of the WhatsApp Business Account. A template with a document
// header needs an example file, which Meta takes as an upload handle; the handle comes from a small sample PDF uploaded through
// the app's resumable upload, so it needs the app id.
import { DomainError } from '@/domain/shared/errors';
import type {
  MetaTemplateDraft,
  MetaTemplateRecord,
  WhatsAppTemplateCatalog,
} from '@/application/ports/whatsapp';
import type { MetaGraphClient } from './graph-client';

/** A minimal one-page PDF. Meta only needs a file of the right type as the example of a document header. */
const SAMPLE_PDF = [
  '%PDF-1.4',
  '1 0 obj <</Type/Catalog/Pages 2 0 R>> endobj',
  '2 0 obj <</Type/Pages/Kids[3 0 R]/Count 1>> endobj',
  '3 0 obj <</Type/Page/Parent 2 0 R/MediaBox[0 0 300 144]>> endobj',
  'trailer <</Root 1 0 R>>',
  '%%EOF',
].join('\n');

/** One template row as the Graph API returns it. */
interface TemplateRow {
  language: string;
  status: string;
  rejected_reason?: string;
}

/** Meta's word for "no rejection reason". */
const NO_REASON = 'NONE';

/** Template catalog of the WhatsApp Business Account. */
export class MetaTemplateCatalog implements WhatsAppTemplateCatalog {
  /**
   * @param graph Shared Graph client.
   * @param wabaId WHATSAPP_WABA_ID, or null when not set.
   * @param appId META_APP_ID, needed only for templates with a document header; null when not set.
   */
  constructor(
    private readonly graph: MetaGraphClient,
    private readonly wabaId: string | null,
    private readonly appId: string | null,
  ) {}

  isConfigured(): boolean {
    return Boolean(this.wabaId) && this.graph.isConfigured();
  }

  async findByName(name: string): Promise<MetaTemplateRecord[]> {
    const result = await this.graph.get<{ data?: TemplateRow[] }>(`${this.requireWaba()}/message_templates`, {
      name,
      fields: 'name,language,status,rejected_reason',
    });
    return (result.data ?? []).map((row) => ({
      languageCode: row.language,
      status: row.status,
      reason: row.rejected_reason && row.rejected_reason !== NO_REASON ? row.rejected_reason : null,
    }));
  }

  /**
   * Creates the template in one language. Category UTILITY: order updates are not marketing, and Meta reviews them faster.
   * @param draft Name, language, body with examples, optional URL button and document header.
   * @returns The id and the status Meta gave it.
   */
  async create(draft: MetaTemplateDraft): Promise<{ id: string; status: string }> {
    const components: Record<string, unknown>[] = [];
    if (draft.documentHeader) {
      components.push({
        type: 'HEADER',
        format: 'DOCUMENT',
        example: { header_handle: [await this.sampleDocumentHandle()] },
      });
    }
    components.push({
      type: 'BODY',
      text: draft.bodyText,
      ...(draft.bodyExamples.length > 0 ? { example: { body_text: [draft.bodyExamples] } } : {}),
    });
    if (draft.button) {
      components.push({
        type: 'BUTTONS',
        buttons: [
          {
            type: 'URL',
            text: draft.button.label,
            url: `${draft.button.baseUrl}{{1}}`,
            example: [draft.button.example],
          },
        ],
      });
    }
    const created = await this.graph.postJson<{ id: string; status: string }>(
      `${this.requireWaba()}/message_templates`,
      { name: draft.name, language: draft.languageCode, category: 'UTILITY', components },
    );
    return { id: created.id, status: created.status };
  }

  /**
   * Uploads the sample PDF through a resumable upload session and returns the handle Meta uses as the header example.
   * @returns The upload handle.
   * @throws DomainError INVALID_STATE with reason APP_ID_MISSING when META_APP_ID is not set.
   */
  private async sampleDocumentHandle(): Promise<string> {
    if (!this.appId) {
      throw new DomainError('INVALID_STATE', 'META_APP_ID is needed for templates with a document.', {
        reason: 'APP_ID_MISSING',
      });
    }
    const bytes = new TextEncoder().encode(SAMPLE_PDF);
    const session = await this.graph.request<{ id: string }>(`${this.appId}/uploads`, {
      method: 'POST',
      query: { file_name: 'sample.pdf', file_length: String(bytes.byteLength), file_type: 'application/pdf' },
    });
    const upload = await this.graph.request<{ h: string }>(session.id, {
      method: 'POST',
      scheme: 'OAuth',
      headers: { file_offset: '0', 'content-type': 'application/pdf' },
      body: bytes,
    });
    return upload.h;
  }

  /**
   * The WhatsApp Business Account id.
   * @throws DomainError INVALID_STATE with reason NOT_CONNECTED.
   */
  private requireWaba(): string {
    if (!this.isConfigured() || !this.wabaId) {
      throw new DomainError('INVALID_STATE', 'WhatsApp is not connected to Meta.', {
        reason: 'NOT_CONNECTED',
      });
    }
    return this.wabaId;
  }
}
