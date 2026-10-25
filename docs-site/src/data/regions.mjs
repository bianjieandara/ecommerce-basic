// Regions the guide shows prices and tax details for. One list feeds the picker, the CSS that hides the other regions, the early
// head script (also used by astro.config.mjs) and the price tables. Plain .mjs so the Astro config can import it.

/** Region codes: `intl` is the default (US dollars), `mx` is Mexico (pesos) and `ec` is Ecuador (US dollars, with local prices). */
/** @type {readonly ['intl', 'mx', 'ec']} */
export const REGIONS = ['intl', 'mx', 'ec'];

/** Region shown when nothing is saved and the visitor's time zone is not one of the listed countries. */
export const DEFAULT_REGION = 'intl';

/** localStorage key that remembers the visitor's choice between pages. */
export const REGION_STORAGE_KEY = 'guide-region';

/** Time zones that tell us the visitor is probably in a listed country, so the right prices show before they touch the picker. */
export const REGION_TIME_ZONES = {
  mx: [
    'America/Mexico_City',
    'America/Cancun',
    'America/Merida',
    'America/Monterrey',
    'America/Matamoros',
    'America/Chihuahua',
    'America/Ciudad_Juarez',
    'America/Ojinaga',
    'America/Mazatlan',
    'America/Hermosillo',
    'America/Bahia_Banderas',
    'America/Tijuana',
  ],
  ec: ['America/Guayaquil', 'Pacific/Galapagos'],
};

/**
 * Source of the script that sets `data-region` on <html> before the page paints, so there is no flash of the wrong prices.
 * Saved choice first, then the time zone, then the default. Written as ES5 because it runs inline in the head, unprocessed.
 */
export function regionBootstrapScript() {
  return (
    '(function(){var r=' + JSON.stringify(REGIONS) +
    ',tz=' + JSON.stringify(REGION_TIME_ZONES) +
    ',v;try{v=localStorage.getItem(' + JSON.stringify(REGION_STORAGE_KEY) + ')}catch(e){}' +
    'if(r.indexOf(v)<0){v=' + JSON.stringify(DEFAULT_REGION) +
    ';try{var z=Intl.DateTimeFormat().resolvedOptions().timeZone;for(var g in tz){if(tz[g].indexOf(z)>-1)v=g}}catch(e){}}' +
    'document.documentElement.dataset.region=v})();'
  );
}
