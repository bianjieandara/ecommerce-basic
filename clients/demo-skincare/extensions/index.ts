// Fallback client extension, used when a client has no extensions folder of its own.
// A client extension can add widget definitions/renderers and a stylesheet (see docs/CUSTOMIZATION.md).
export const clientExtension = {
  widgetDefinitions: [] as unknown[],
  widgetRenderers: {} as Record<string, unknown>,
  stylesheet: '',
};
