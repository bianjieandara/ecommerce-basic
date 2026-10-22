// Copy button for a text the owner passes on, such as a customer's order link. The label says whether the copy worked.
import { useState } from 'preact/hooks';
import { BUTTON } from './lib/classes';

/** Props of the copy button. */
export interface CopyButtonProps {
  /** Text to copy to the clipboard. */
  value: string;
  /** Label of the button before a copy. */
  label: string;
  /** Label shown after a successful copy. */
  copiedLabel: string;
  /** Label shown when the browser does not allow the copy. */
  errorLabel: string;
}

/**
 * Button that copies a text to the clipboard and then says whether that worked.
 * @param props Text and labels.
 */
export default function CopyButton(props: CopyButtonProps) {
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle');

  /** Copies the text. A browser that refuses the clipboard leaves the text to be copied by hand. */
  async function copy() {
    try {
      await navigator.clipboard.writeText(props.value);
      setState('copied');
    } catch {
      setState('failed');
    }
  }

  const label = state === 'copied' ? props.copiedLabel : state === 'failed' ? props.errorLabel : props.label;
  return (
    <button type="button" class={BUTTON} onClick={copy}>
      {label}
    </button>
  );
}
