// Widget registry: the list of page-builder blocks, with the fields each block exposes to admins.
// Renderers (the Astro components) live in src/ui/widgets and are matched by `type`. Client extensions can add
// definitions in their own folder; they are merged in the UI layer, so this module stays free of UI imports.
import { CORE_WIDGETS } from './core-widgets';
import type { WidgetDefinition } from './widget-types';

export {
  CORE_WIDGET_TYPES,
  type WidgetDefinition,
  type WidgetInstance,
  type WidgetType,
} from './widget-types';
export { CORE_WIDGETS } from './core-widgets';

/**
 * Returns the widget definitions available to page builders.
 * @returns Core definitions (client extensions are merged by the UI layer).
 */
export function getWidgetDefinitions(): WidgetDefinition[] {
  return CORE_WIDGETS;
}

/**
 * Finds one widget definition by type.
 * @param type Widget type identifier.
 * @returns The definition, or undefined for unknown types (renderers skip them).
 */
export function findWidgetDefinition(type: string): WidgetDefinition | undefined {
  return CORE_WIDGETS.find((definition) => definition.type === type);
}
