// Carga y formato de los precios publicados en e-baq.com/precios.json. Vive aquí y no dentro de un componente porque lo usan
// Precio.astro (un importe suelto) y PrecioFila.astro (los tres productos en fila), y un precio distinto en cada sitio sería peor
// que no mostrarlo.
import respaldo from './precios-respaldo.json';
import type { REGIONS } from './regions.mjs';

const PRECIOS_URL = 'https://e-baq.com/precios.json';

/** Lo que publica el sitio para un producto en una región. */
export interface PrecioPublicado {
  monto: number;
  moneda: string;
  iva_incluido: boolean;
}

/** Productos por región, tal como viene el archivo. */
export type TablaPrecios = Record<string, Record<string, PrecioPublicado>>;

/** La región de la guía en minúsculas es la clave del archivo de precios en mayúsculas. */
export const CLAVE_REGION = { intl: 'INTL', mx: 'MX', ec: 'EC' } as const;

export type Region = (typeof REGIONS)[number];
export type Lang = 'es' | 'en';

/**
 * El sitio manda, el respaldo rellena. Se mezcla por producto y por región en vez de reemplazar la tabla entera porque el feed
 * publicado puede ir por detrás del repositorio: cuando se añadió el precio en pesos, e-baq.com todavía servía solo los dólares
 * y la guía se quedó sin un número que enseñarle a México. Con la mezcla, una región que aún no está publicada usa la copia local.
 */
function mezclar(base: TablaPrecios, encima: TablaPrecios): TablaPrecios {
  const salida: TablaPrecios = { ...base };
  for (const [producto, regiones] of Object.entries(encima)) {
    salida[producto] = { ...(base[producto] ?? {}), ...regiones };
  }
  return salida;
}

/** Los precios vigentes al construir la guía. Si el sitio no responde, la copia del repositorio basta para que el build no falle. */
export async function cargarPrecios(): Promise<TablaPrecios> {
  try {
    const respuesta = await fetch(PRECIOS_URL, { signal: AbortSignal.timeout(5000) });
    if (respuesta.ok) {
      return mezclar(respaldo, await respuesta.json());
    }
    console.warn(`precios.json respondió ${respuesta.status}; se usa la copia del repositorio`);
  } catch (error) {
    console.warn('No se pudo leer precios.json; se usa la copia del repositorio', error);
  }
  return respaldo;
}

/** El importe con su moneda. La nota de impuesto va aparte: dentro de la cifra se leía tan grande como el precio. */
export function formatearPrecio(precio: PrecioPublicado, lang: Lang) {
  const monto = precio.monto.toLocaleString(lang === 'en' ? 'en-US' : 'es-MX');
  return {
    importe: `$${monto} ${precio.moneda}`,
    nota: precio.iva_incluido ? (lang === 'en' ? 'Tax included.' : 'IVA incluido.') : null,
  };
}
