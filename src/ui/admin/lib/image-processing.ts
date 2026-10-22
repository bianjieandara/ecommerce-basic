// Browser-side resizing before upload. The store never resizes on the server (that would cost compute on every upload);
// the browser makes the sizes, and the server only checks their bytes.
import { ACCEPTED_MEDIA_TYPES, MEDIA_WIDTHS } from '@/domain/media/media-asset';

/** One resized size, ready to upload. */
export interface ResizedSize {
  width: number;
  blob: Blob;
}

/** An image resized to every width the store uses, without upscaling. */
export interface ResizedImage {
  width: number;
  height: number;
  sizes: ResizedSize[];
}

/**
 * Resizes a photo. Orientation comes from its EXIF data. WebP is preferred; browsers that cannot encode WebP fall back to
 * JPEG. An original narrower than the smallest width keeps its own width instead of being enlarged.
 * @param file Image chosen by the admin.
 * @returns The original size and the resized sizes.
 * @throws Error when the file type is not accepted or the image cannot be decoded.
 */
export async function resizeImage(file: File): Promise<ResizedImage> {
  if (!(ACCEPTED_MEDIA_TYPES as readonly string[]).includes(file.type)) throw new Error('unsupported');
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  try {
    const fitting = MEDIA_WIDTHS.filter((width) => width <= bitmap.width);
    const widths: number[] = fitting.length > 0 ? fitting : [bitmap.width];
    const sizes: ResizedSize[] = [];
    for (const width of widths) {
      const height = Math.round((bitmap.height * width) / bitmap.width);
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext('2d');
      if (!context) throw new Error('canvas');
      context.drawImage(bitmap, 0, 0, width, height);
      sizes.push({ width, blob: await encode(canvas) });
    }
    return { width: bitmap.width, height: bitmap.height, sizes };
  } finally {
    bitmap.close();
  }
}

/**
 * Encodes a canvas as WebP at quality 0.82, or as JPEG at 0.85 when the browser cannot encode WebP (it then returns PNG).
 * @param canvas Canvas with the resized image.
 * @returns The encoded image.
 * @throws Error when neither format can be encoded.
 */
function encode(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (webp) => {
        if (webp && webp.type === 'image/webp') {
          resolve(webp);
          return;
        }
        canvas.toBlob((jpeg) => (jpeg ? resolve(jpeg) : reject(new Error('encode'))), 'image/jpeg', 0.85);
      },
      'image/webp',
      0.82,
    );
  });
}
