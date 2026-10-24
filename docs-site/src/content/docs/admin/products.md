---
title: Productos
description: Crear y editar productos, opciones, imágenes y precios.
sidebar:
  order: 2
---

## La lista de productos

![La lista de productos](../../../assets/screens/es/admin-products.png)

Encuentra productos con el buscador o con los filtros **Estado**, **Categoría**, **En oferta** y **Agotados**. Arriba a la derecha
eliges cómo verlos:

- **Cuadrícula:** una tarjeta por producto, con su imagen, nombre, precio, estado y stock. Es la vista para reconocer un producto de
  un vistazo. Un producto sin imagen muestra su inicial.
- **Filas:** una fila por producto, con precio, stock y número de variantes, y dos acciones rápidas: **Despublicar / Publicar**
  (oculta un producto de la tienda sin borrarlo) y **Duplicar** (empieza un producto nuevo a partir de uno existente).

La vista queda en la dirección (`?view=rows` para las filas; la cuadrícula es la vista por defecto), así que puedes guardarla o compartirla.

![La lista de productos en filas](../../../assets/screens/es/admin-products-rows.png)

### Cambiar varios productos a la vez

Marca la casilla de cada producto, en cualquiera de las dos vistas. Abajo aparece una barra con **«N seleccionados»**, **Despublicar**
y **Publicar**: el cambio se aplica a todos los marcados con una sola petición (hasta 100). Los productos que ya no existen se
ignoran.

Pulsa **Nuevo producto** para crear uno.

## Editar un producto

![Editar un producto](../../../assets/screens/es/admin-product-edit.png)

**Datos**

- **Estado:** *Borrador* (no visible), *Activo* (a la venta) o *Archivado* (guardado pero oculto).
- **Destacado:** muestra el producto en los bloques de destacados de la página de inicio.
- **Precio** y **Precio de comparación:** el de comparación es el precio anterior que aparece tachado cuando haces una oferta. El
  dinero se escribe en la moneda de la tienda, por ejemplo `25.00`.
- **Tasa de impuesto (%):** déjala vacía para usar la tasa de la tienda, o pon otra (por ejemplo 0 % para un artículo exento).
- **Categorías:** marca una o varias. Si aún no hay, crea primero una categoría.

**Textos** tiene una pestaña por idioma. Escribe el nombre, la descripción corta y una descripción más larga en Markdown (puedes
usar `**negrita**`, listas y enlaces). El **slug** es la dirección web del producto en ese idioma; si lo dejas vacío se genera
desde el nombre. **Título SEO** y **Descripción SEO** son lo que muestra Google; si los dejas vacíos la tienda escribe unos
razonables.

**Vista previa:** a la derecha (debajo, en el celular) la tienda dibuja la tarjeta del producto con lo que escribes: imagen,
nombre, precio, etiqueta de oferta y categoría. Cambia mientras escribes, sin guardar.

**Imágenes:** agrégalas desde la biblioteca y reordénalas con las flechas. La primera es la imagen principal del producto y la que
aparece en los listados y al compartir un enlace.

## Opciones (variantes)

Muchos productos vienen en tallas o colores. Cada combinación es una **variante** con su propio SKU, código de barras, stock y,
si hace falta, su propio precio.

![Variantes de un producto](../../../assets/screens/es/admin-product-variants.png)

1. En **Generar variantes desde atributos**, marca los valores que vendes (por ejemplo tallas S, M, L y colores Negro, Blanco).
2. Pulsa **Generar variantes**. La tienda crea todas las combinaciones.
3. Rellena cada variante: **SKU** (tu código), **Código de barras**, **Stock**, **Costo** (lo que te cuesta; se usa en el valor
   del inventario y en los reportes), un **Precio** opcional si esa opción cuesta más, una **Alerta de stock bajo** y una imagen
   opcional.
4. **Controlar stock** activa o desactiva el conteo de stock (desactívalo para servicios o productos bajo pedido).
   **Desactivar** oculta una variante sin perder su historial.

Un producto sin tallas ni colores tiene una sola variante («Producto simple»); el formulario la sigue mostrando para que pongas su
SKU y su stock.

Pulsa **Guardar**. El campo **Nota para los cambios de stock** al final se guarda con cualquier cambio de stock que hayas hecho,
de modo que el [historial del inventario](/admin/inventory/) muestre el motivo.

:::tip
Al guardar un producto se renuevan las páginas de la tienda que lo muestran. Abre la ficha en una ventana privada para ver
exactamente lo que ve quien compra.
:::

Las categorías, los atributos (tallas, colores) y las imágenes se preparan en [Categorías, atributos y multimedia](/admin/catalog-setup/).
