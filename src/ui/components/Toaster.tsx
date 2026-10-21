// Toast region (Preact island). Renders the shared toast store; errors are announced assertively for screen readers.
import { useStore } from '@nanostores/preact';
import { dismissToast, toasts } from '../stores/toast';

const toneClasses = {
  neutral: 'bg-text text-background',
  success: 'bg-emerald-700 text-white',
  error: 'bg-accent text-on-primary',
} as const;

/** Fixed region above the mobile tab bar that lists the current toasts. */
export default function Toaster() {
  const items = useStore(toasts);
  return (
    <div
      class="pointer-events-none fixed inset-x-0 bottom-20 z-50 flex flex-col items-center gap-2 px-4 md:bottom-6"
      role="status"
      aria-live="polite"
    >
      {items.map((toast) => (
        <button
          key={toast.id}
          type="button"
          onClick={() => dismissToast(toast.id)}
          class={`animate-slide-up rounded-brand pointer-events-auto px-4 py-3 text-sm font-medium shadow-lg ${toneClasses[toast.tone]}`}
        >
          {toast.text}
        </button>
      ))}
    </div>
  );
}
