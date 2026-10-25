// The demo shows the cookie banner to every visitor. It has no Pixel and no GA4, and in the default mode ("auto") the banner only appears
// when one of them is set, so only "always" shows it. The nightly reset deletes the settings and restores the snapshot's, so a snapshot
// without that setting would quietly turn the banner off at the next reset. `demo:snapshot` runs this check on what it is about to write.

/**
 * Refuses a settings table whose marketing group does not keep the cookie banner always on.
 * @param {Record<string, unknown>[]} settingsRows Rows of the settings table, as read from the store.
 * @throws {Error} When there is no marketing row, or its `consentBannerMode` is not "always".
 */
export function assertBannerAlways(settingsRows) {
  const row = settingsRows.find((candidate) => candidate.group_key === 'marketing');
  let mode;
  try {
    mode = row ? JSON.parse(String(row.value_json)).consentBannerMode : undefined;
  } catch {
    mode = undefined;
  }
  if (mode !== 'always')
    throw new Error(
      `The demo snapshot must keep the cookie banner always on (marketing.consentBannerMode "always"), and this store has ${
        mode === undefined ? 'no such setting' : `"${mode}"`
      }. Run \`npm run docs:data\` on it (applyDemoCookieBanner), or set it in Settings > Marketing, and take the snapshot again.`,
    );
}
