// Toast notifications shared between islands and page scripts. Messages are short-lived and dismissed automatically.
import { atom } from 'nanostores';

/** One toast message. */
export interface Toast {
  id: number;
  text: string;
  tone: 'neutral' | 'success' | 'error';
}

/** Currently visible toasts. */
export const toasts = atom<Toast[]>([]);

/** How long a toast stays on screen before it is removed. */
const TOAST_MS = 4000;
let nextId = 1;

/**
 * Shows a toast and removes it after a few seconds.
 * @param text Message to show (already translated).
 * @param tone Visual tone; errors are announced assertively by the Toaster.
 */
export function showToast(text: string, tone: Toast['tone'] = 'neutral'): void {
  const id = nextId++;
  toasts.set([...toasts.get(), { id, text, tone }]);
  window.setTimeout(() => dismissToast(id), TOAST_MS);
}

/**
 * Removes one toast.
 * @param id Toast id.
 */
export function dismissToast(id: number): void {
  toasts.set(toasts.get().filter((toast) => toast.id !== id));
}
