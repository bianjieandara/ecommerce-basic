// Submit-on-change for native <select> elements marked with `data-submit-on-change` (see components/Select.astro).
// It lives in a script, not in an inline `onchange`, because the page policy refuses inline handlers.

/**
 * Makes every marked select submit its form when the choice changes. Safe to call more than once.
 * Typed as HTMLElement: with `HTMLSelectElement` the compiler rejects `querySelectorAll` (TypeScript 6.0), and the form is
 * reached through `closest` anyway.
 */
export function initSelects(): void {
  document.querySelectorAll<HTMLElement>('select[data-submit-on-change]').forEach((select) => {
    if (select.dataset.selectReady === 'true') return;
    select.dataset.selectReady = 'true';
    select.addEventListener('change', () => select.closest('form')?.requestSubmit());
  });
}
