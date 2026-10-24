---
title: Cómo se hace esta guía
description: De dónde salen las capturas y cómo renovarlas.
sidebar:
  order: 2
---

Las páginas son archivos Markdown en `docs-site/src/content/docs/`, que muestra [Starlight](https://starlight.astro.build).
Las capturas **no** se hacen a mano: un script abre la tienda real en un Chrome sin ventana y guarda cada pantalla, así que
coinciden con el producto y se pueden renovar en minutos después de un cambio.

## Renovar las capturas

Necesitas Node y Google Chrome en la máquina. Desde la raíz del repositorio:

```sh
npm run build                      # la tienda tal como se publicará
npm run docs:store                 # arranca una tienda demo en http://localhost:4400 con su propia base de datos
npm run docs:data                  # la llena con productos, imágenes, pedidos y testimonios de ejemplo
npm run docs:screens               # toma todas las capturas en docs-site/src/assets/screens/es/
DOCS_LANG=en npm run docs:screens  # las mismas capturas con la interfaz en inglés (carpeta en/)
```

`npm run docs:screens -- admin-orders` toma solo las capturas cuyo nombre empieza por `admin-orders`.

La tienda demo guarda sus datos en `.wrangler/docs-state/`, separados de la base de datos de desarrollo, así que nada de lo que
haces para la guía toca datos reales. La cuenta de ejemplo del propietario la crea el script y su acceso queda en
`.wrangler/docs-admin.json`, que nunca se sube al repositorio.

## Ver y publicar la guía

```sh
npm run docs:dev                   # http://localhost:4500 con recarga en vivo
npm run docs:build                 # sitio estático en docs-site/dist/
```

El resultado son archivos estáticos. Se pueden alojar en Cloudflare (Workers con recursos estáticos o Pages) o en cualquier
hosting web.

## Idiomas

El español es el idioma principal y está en la raíz del sitio; el inglés está en `/en/`. Cada idioma tiene su propia carpeta de
capturas, para que la interfaz que se ve coincida con el idioma del texto.
