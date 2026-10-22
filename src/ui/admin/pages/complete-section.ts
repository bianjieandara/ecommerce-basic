// Fills the settings a stored section lacks with its widget's defaults. Seeded sections can predate a widget's fields, and the
// save checks every field the widget declares, so the builder completes each section when it opens the page.
import type { SectionValue } from './SectionEditor';
import type { WidgetChoice } from './PageBuilder';

/**
 * Returns the section with every setting its widget declares.
 * @param section A section as stored.
 * @param widgets The widgets the builder can use.
 * @returns The section; a section whose widget is unknown is returned unchanged.
 */
export function completeSection(section: SectionValue, widgets: WidgetChoice[]): SectionValue {
  const widget = widgets.find((item) => item.type === section.type);
  if (!widget) return section;
  return { ...section, config: { ...structuredClone(widget.defaults), ...section.config } };
}
