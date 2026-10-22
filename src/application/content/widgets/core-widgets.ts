// The widget definitions shipped with the template, with the fields each one exposes to admins in the page builder.
import { bilingual as text } from '@/domain/shared/localized-text';
import type { WidgetDefinition } from './widget-types';

/** Every core widget definition, in the order shown in the admin picker. */
export const CORE_WIDGETS: WidgetDefinition[] = [
  {
    type: 'hero_carousel',
    label: text('Carrusel principal', 'Hero carousel'),
    icon: 'carousel',
    fields: [
      {
        name: 'slides',
        kind: 'repeater',
        label: text('Diapositivas', 'Slides'),
        max: 6,
        fields: [
          { name: 'image', kind: 'image', label: text('Imagen', 'Image') },
          { name: 'title', kind: 'localizedText', label: text('Título', 'Title'), max: 80 },
          { name: 'subtitle', kind: 'localizedText', label: text('Subtítulo', 'Subtitle'), max: 140 },
          { name: 'cta', kind: 'link', label: text('Botón', 'Button') },
        ],
      },
      {
        name: 'autoplaySeconds',
        kind: 'number',
        label: text('Segundos por diapositiva', 'Seconds per slide'),
        min: 0,
        max: 30,
      },
    ],
    defaults: { slides: [], autoplaySeconds: 6 },
  },
  {
    type: 'featured_products',
    label: text('Productos destacados', 'Featured products'),
    icon: 'grid',
    fields: [
      { name: 'title', kind: 'localizedText', label: text('Título', 'Title'), max: 80 },
      {
        name: 'source',
        kind: 'select',
        label: text('Origen', 'Source'),
        options: [
          { value: 'featured', label: text('Destacados', 'Featured') },
          { value: 'newest', label: text('Novedades', 'Newest') },
          { value: 'best_sellers', label: text('Más vendidos', 'Best sellers') },
          { value: 'category', label: text('Categoría', 'Category') },
          { value: 'manual', label: text('Manual', 'Manual') },
        ],
      },
      { name: 'categoryIds', kind: 'categoryIds', label: text('Categorías', 'Categories'), max: 3 },
      { name: 'productIds', kind: 'productIds', label: text('Productos', 'Products'), max: 24 },
      { name: 'limit', kind: 'number', label: text('Cantidad', 'Count'), min: 1, max: 24 },
      {
        name: 'layout',
        kind: 'select',
        label: text('Diseño', 'Layout'),
        options: [
          { value: 'carousel', label: text('Carrusel', 'Carousel') },
          { value: 'grid', label: text('Cuadrícula', 'Grid') },
        ],
      },
    ],
    defaults: {
      title: { es: 'Destacados', en: 'Featured' },
      source: 'featured',
      categoryIds: [],
      productIds: [],
      limit: 8,
      layout: 'carousel',
    },
  },
  {
    type: 'category_grid',
    label: text('Cuadrícula de categorías', 'Category grid'),
    icon: 'tiles',
    fields: [
      { name: 'title', kind: 'localizedText', label: text('Título', 'Title'), max: 80 },
      { name: 'categoryIds', kind: 'categoryIds', label: text('Categorías', 'Categories'), max: 12 },
    ],
    defaults: { title: { es: 'Compra por categoría', en: 'Shop by category' }, categoryIds: [] },
  },
  {
    type: 'promo_banner',
    label: text('Banner promocional', 'Promo banner'),
    icon: 'megaphone',
    fields: [
      { name: 'image', kind: 'image', label: text('Imagen', 'Image') },
      { name: 'title', kind: 'localizedText', label: text('Título', 'Title'), max: 80 },
      { name: 'text', kind: 'localizedText', label: text('Texto', 'Text'), max: 200 },
      { name: 'cta', kind: 'link', label: text('Botón', 'Button') },
      {
        name: 'align',
        kind: 'select',
        label: text('Alineación', 'Alignment'),
        options: [
          { value: 'left', label: text('Izquierda', 'Left') },
          { value: 'center', label: text('Centro', 'Center') },
        ],
      },
    ],
    defaults: { align: 'left' },
  },
  {
    type: 'rich_text',
    label: text('Texto', 'Rich text'),
    icon: 'text',
    fields: [{ name: 'body', kind: 'localizedMarkdown', label: text('Contenido', 'Content'), max: 20000 }],
    defaults: { body: { es: '', en: '' } },
  },
  {
    type: 'testimonials',
    label: text('Testimonios y reseñas', 'Testimonials and reviews'),
    icon: 'star',
    fields: [
      { name: 'title', kind: 'localizedText', label: text('Título', 'Title'), max: 80 },
      {
        name: 'includeGoogle',
        kind: 'boolean',
        label: text('Mostrar reseñas de Google', 'Show Google reviews'),
      },
      {
        name: 'includeManual',
        kind: 'boolean',
        label: text('Mostrar testimonios propios', 'Show manual testimonials'),
      },
      { name: 'limit', kind: 'number', label: text('Cantidad', 'Count'), min: 1, max: 12 },
    ],
    defaults: {
      title: { es: 'Lo que dicen nuestros clientes', en: 'What our customers say' },
      includeGoogle: true,
      includeManual: true,
      limit: 6,
    },
  },
  {
    type: 'image_gallery',
    label: text('Galería', 'Image gallery'),
    icon: 'images',
    fields: [
      { name: 'images', kind: 'images', label: text('Imágenes', 'Images'), max: 12 },
      {
        name: 'layout',
        kind: 'select',
        label: text('Diseño', 'Layout'),
        options: [
          { value: 'grid', label: text('Cuadrícula', 'Grid') },
          { value: 'carousel', label: text('Carrusel', 'Carousel') },
        ],
      },
    ],
    defaults: { images: [], layout: 'grid' },
  },
  {
    type: 'faq',
    label: text('Preguntas frecuentes', 'FAQ'),
    icon: 'help',
    fields: [
      {
        name: 'items',
        kind: 'repeater',
        label: text('Preguntas', 'Questions'),
        max: 30,
        fields: [
          { name: 'question', kind: 'localizedText', label: text('Pregunta', 'Question'), max: 200 },
          { name: 'answer', kind: 'localizedMarkdown', label: text('Respuesta', 'Answer'), max: 2000 },
        ],
      },
    ],
    defaults: { items: [] },
  },
  {
    type: 'whatsapp_cta',
    label: text('Llamado a WhatsApp', 'WhatsApp call to action'),
    icon: 'chat',
    fields: [
      { name: 'title', kind: 'localizedText', label: text('Título', 'Title'), max: 80 },
      { name: 'text', kind: 'localizedText', label: text('Texto', 'Text'), max: 200 },
      { name: 'buttonLabel', kind: 'localizedText', label: text('Botón', 'Button'), max: 40 },
    ],
    defaults: {
      title: { es: '¿Tienes dudas?', en: 'Have questions?' },
      text: { es: 'Escríbenos y te respondemos rápido.', en: 'Message us and we will reply quickly.' },
      buttonLabel: { es: 'Escribir por WhatsApp', en: 'Chat on WhatsApp' },
    },
  },
  {
    type: 'trust_badges',
    label: text('Beneficios', 'Trust badges'),
    icon: 'shield',
    fields: [
      {
        name: 'items',
        kind: 'repeater',
        label: text('Beneficios', 'Badges'),
        max: 6,
        fields: [
          {
            name: 'icon',
            kind: 'select',
            label: text('Icono', 'Icon'),
            options: [
              { value: 'truck', label: text('Envío', 'Shipping') },
              { value: 'return', label: text('Cambios', 'Returns') },
              { value: 'lock', label: text('Pago seguro', 'Secure payment') },
              { value: 'chat', label: text('Atención', 'Support') },
            ],
          },
          { name: 'text', kind: 'localizedText', label: text('Texto', 'Text'), max: 80 },
        ],
      },
    ],
    defaults: { items: [] },
  },
];
