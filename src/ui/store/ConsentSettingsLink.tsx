// "Privacy settings" control (Preact island). Forgets the stored consent choice and reloads, so the banner can ask again.
import { consentCookieString } from '@/domain/consent/consent';

/** Props of the privacy settings control. */
export interface ConsentSettingsLinkProps {
  /** Visible text, from the `consent.settings` dictionary key. */
  label: string;
}

/**
 * Reopens the consent banner. A reload is needed because the server decides from the cookies of the request
 * whether the banner is shown, so the cleared cookie has to reach the server.
 */
export default function ConsentSettingsLink({ label }: ConsentSettingsLinkProps) {
  function reopen() {
    document.cookie = consentCookieString(null, location.protocol === 'https:');
    location.reload();
  }

  return (
    <button
      type="button"
      onClick={reopen}
      class="inline-flex min-h-11 items-center text-sm underline-offset-4 opacity-80 hover:underline hover:opacity-100 md:min-h-8"
    >
      {label}
    </button>
  );
}
