// Parameter mapping of one WhatsApp template: which context value fills {{1}}, {{2}}, and so on. Locked while Meta has approved
// the template, because Meta checks the mapping against the approved body.
import { FIELD, LABEL, STEP_BUTTON } from '@/ui/admin/lib/classes';
import type { WhatsAppVariable } from '@/application/notifications/whatsapp/definition';
import type { WhatsAppLabels } from './whatsapp-labels';

/** Props of the parameter editor. */
export interface WhatsAppParamEditorProps {
  params: WhatsAppVariable[];
  locked: boolean;
  labels: WhatsAppLabels;
  /** Values offered for each parameter, in the order of the closed list. */
  options: WhatsAppVariable[];
  onChange: (params: WhatsAppVariable[]) => void;
}

/**
 * One select per parameter, with buttons to add and remove. Each select is 44px high to be easy to tap.
 * @param props Current mapping, lock state, labels and change handler.
 */
export default function WhatsAppParamEditor(props: WhatsAppParamEditorProps) {
  const { params, locked, labels, options, onChange } = props;

  /**
   * Replaces the variable of one parameter.
   * @param index Position of the parameter (0 is {{1}}).
   * @param value Chosen variable.
   */
  function setAt(index: number, value: WhatsAppVariable) {
    onChange(params.map((current, position) => (position === index ? value : current)));
  }

  /** Removes the parameter at the position; the later ones shift down. */
  function removeAt(index: number) {
    onChange(params.filter((_, position) => position !== index));
  }

  return (
    <fieldset class="flex flex-col gap-2">
      <legend class="text-sm font-semibold">{labels.card.params}</legend>
      {params.map((value, index) => (
        <div key={index} class="flex items-center gap-2">
          <label class={`${LABEL} min-w-0 flex-1`}>
            <span class="text-text/70 text-xs">{labels.card.paramFor.replace('{n}', String(index + 1))}</span>
            <select
              class={FIELD}
              value={value}
              disabled={locked}
              onChange={(event) => setAt(index, event.currentTarget.value as WhatsAppVariable)}
            >
              {options.map((option) => (
                <option key={option} value={option}>
                  {labels.variables[option]}
                </option>
              ))}
            </select>
          </label>
          {!locked && (
            <button
              type="button"
              class={STEP_BUTTON}
              aria-label={labels.card.removeParam}
              onClick={() => removeAt(index)}
            >
              −
            </button>
          )}
        </div>
      ))}
      {!locked && (
        <button
          type="button"
          class="rounded-brand border-text/20 min-h-11 self-start border px-4 text-sm font-semibold"
          onClick={() => onChange([...params, options[0] ?? 'customer.firstName'])}
        >
          {labels.card.addParam}
        </button>
      )}
    </fieldset>
  );
}
