// Inline SVG icon for Preact islands: the same paths and stroke as Icon.astro, which islands cannot import.
import { ICON_PATHS, type IconName } from './icons';

/** Props of the icon. */
export interface PreactIconProps {
  name: IconName;
  size?: number;
  class?: string;
}

/**
 * Draws one icon from the shared icon registry. Decorative: the control that holds it carries the accessible name.
 * @param props Icon name, size in pixels and optional classes.
 */
export default function PreactIcon({ name, size = 20, class: className }: PreactIconProps) {
  return (
    <svg
      class={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="1.8"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
      // The registry holds trusted, fixed markup (see icons.ts), the same as Icon.astro renders.
      dangerouslySetInnerHTML={{ __html: ICON_PATHS[name] }}
    />
  );
}
