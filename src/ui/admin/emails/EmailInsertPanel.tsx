// Buttons that insert a variable or a block into the body at the cursor. Only what this email allows is listed, so a typo
// cannot reach the template engine.
import { HEADING, PANEL } from '@/ui/admin/lib/classes';
import { tokenFor } from './email-tokens';
import type { EmailEditorLabels } from './email-editor-types';

const CHIP = 'rounded-brand border-text/20 min-h-11 border bg-white px-3 font-mono text-sm';

/** Props of the insert panel. */
export interface EmailInsertPanelProps {
  labels: Pick<EmailEditorLabels, 'placeholders' | 'placeholdersHelp' | 'variables' | 'blocks'>;
  variables: string[];
  blocks: string[];
  /** Receives the placeholder text to insert. */
  onInsert: (token: string) => void;
}

/**
 * The variables and blocks of one email, as buttons.
 * @param props Allowed names, labels and the insert handler.
 */
export function EmailInsertPanel({ labels, variables, blocks, onInsert }: EmailInsertPanelProps) {
  return (
    <section class={PANEL}>
      <h2 class={HEADING}>{labels.placeholders}</h2>
      <p class="text-text/70 text-sm">{labels.placeholdersHelp}</p>
      <div class="flex flex-col gap-2">
        <span class="text-sm font-semibold">{labels.variables}</span>
        <div class="flex flex-wrap gap-2">
          {variables.map((name) => (
            <button
              key={name}
              type="button"
              class={CHIP}
              onClick={() => onInsert(tokenFor('variable', name))}
            >
              {tokenFor('variable', name)}
            </button>
          ))}
        </div>
      </div>
      {blocks.length > 0 && (
        <div class="flex flex-col gap-2">
          <span class="text-sm font-semibold">{labels.blocks}</span>
          <div class="flex flex-wrap gap-2">
            {blocks.map((name) => (
              <button key={name} type="button" class={CHIP} onClick={() => onInsert(tokenFor('block', name))}>
                {tokenFor('block', name)}
              </button>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
