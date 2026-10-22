// The WhatsApp template list: one card per message, in the order of the definitions. The cards hold their own form state, so a
// save or a sync in one card never disturbs another.
import type { WhatsAppTemplateEntry } from '@/application/notifications/whatsapp/view-model';
import WhatsAppTemplateCard from './WhatsAppTemplateCard';
import type { WhatsAppLabels } from './whatsapp-labels';

/** Props of the list. */
export interface WhatsAppTemplateManagerProps {
  entries: WhatsAppTemplateEntry[];
  labels: WhatsAppLabels;
}

/**
 * Renders one card per WhatsApp message.
 * @param props Entries from the server and labels.
 */
export default function WhatsAppTemplateManager({ entries, labels }: WhatsAppTemplateManagerProps) {
  return (
    <div class="flex flex-col gap-4">
      {entries.map((entry) => (
        <WhatsAppTemplateCard key={entry.key} entry={entry} labels={labels} />
      ))}
    </div>
  );
}
