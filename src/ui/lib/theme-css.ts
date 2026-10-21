// Turns the admin theme settings into CSS custom properties. Only validated values reach the stylesheet:
// colours pass sanitizeHex, and fonts and radii come from fixed maps, so no free text can enter a CSS value.
import { sanitizeHex } from '@/domain/shared/color';
import type { SettingsMap } from '@/application/content/settings-schemas';

/** Corner radius per setting value. */
const RADIUS_VALUES: Record<SettingsMap['theme']['radius'], string> = {
  none: '0',
  sm: '0.25rem',
  md: '0.5rem',
  lg: '1rem',
  full: '9999px',
};

/** Font family per preset. Each family is loaded by global.css through @fontsource. */
const FONT_VALUES: Record<SettingsMap['theme']['fontPreset'], string> = {
  inter: "'Inter Variable'",
  manrope: "'Manrope Variable'",
  playfair: "'Playfair Display Variable'",
};

/**
 * Builds the :root block for a store's theme.
 * @param theme Validated theme settings.
 * @returns CSS text ready for an inline <style> element.
 */
export function themeToCss(theme: SettingsMap['theme']): string {
  const primary = sanitizeHex(theme.colorPrimary, '#111111');
  const declarations = [
    `--brand-primary:${primary}`,
    `--brand-on-primary:${sanitizeHex(theme.colorOnPrimary, '#ffffff')}`,
    `--brand-accent:${sanitizeHex(theme.colorAccent, '#d62828')}`,
    `--brand-background:${sanitizeHex(theme.colorBackground, '#ffffff')}`,
    `--brand-surface:${sanitizeHex(theme.colorSurface, '#f5f5f5')}`,
    `--brand-text:${sanitizeHex(theme.colorText, '#111111')}`,
    `--brand-primary-soft:color-mix(in srgb,${primary} 12%,white)`,
    `--brand-radius:${RADIUS_VALUES[theme.radius]}`,
    `--brand-font:${FONT_VALUES[theme.fontPreset]}`,
  ];
  return `:root{${declarations.join(';')}}`;
}
