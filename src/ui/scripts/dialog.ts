// Dialog controller for native <dialog> elements. Triggers use `data-dialog-open="<id>"`; close buttons use
// `data-dialog-close`. Backdrop clicks close the dialog, and Escape is handled by the browser.

/**
 * Wires every open/close trigger on the page. Safe to call more than once.
 */
export function initDialogs(): void {
  document.querySelectorAll<HTMLButtonElement>('[data-dialog-open]').forEach((button) => {
    if (button.dataset.dialogReady === 'true') return;
    button.dataset.dialogReady = 'true';
    button.addEventListener('click', () => {
      const dialog = document.getElementById(button.dataset.dialogOpen ?? '');
      if (dialog instanceof HTMLDialogElement) dialog.showModal();
    });
  });

  document.querySelectorAll<HTMLDialogElement>('dialog[data-dialog]').forEach((dialog) => {
    if (dialog.dataset.dialogReady === 'true') return;
    dialog.dataset.dialogReady = 'true';
    dialog.querySelectorAll<HTMLElement>('[data-dialog-close]').forEach((control) => {
      control.addEventListener('click', () => dialog.close());
    });
    dialog.addEventListener('click', (event) => {
      // A click directly on the <dialog> element (not its content) is a backdrop click.
      if (event.target === dialog) dialog.close();
    });
  });
}
