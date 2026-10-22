// Props shared by every widget renderer, so the section renderer can pick a component by type.
import type { WidgetInstance } from '@/application/content/widgets/registry';
import type { SectionData } from '@/http/page-content';
import type { StoreView } from '@/ui/lib/store-view';

/** Contact details a widget may need (WhatsApp buttons). */
export interface WhatsAppContact {
  number: string;
  message: string;
}

/** Props of every widget renderer. */
export interface WidgetProps {
  section: WidgetInstance;
  data: SectionData;
  view: StoreView;
  whatsapp: WhatsAppContact;
  /** True for the first section of the page, which is what the visitor sees first: its images load at once. */
  first?: boolean;
}
