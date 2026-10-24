// Media library endpoints: a page of assets for the pickers, and an upload of the sizes the browser resized. Each size is a
// file field named size-<width>, so an original narrower than the store widths is kept at its own width.
import { z } from 'zod';
import { MAX_UPLOAD_BYTES } from '@/domain/media/media-asset';
import { DomainError } from '@/domain/shared/errors';
import { requireAdmin } from '@/http/admin-session';
import { defineEndpoint } from '@/http/define-endpoint';

const SIZE_FIELD = /^size-(\d{2,5})$/;

/** One resized file. The use case checks its bytes, so the declared type is not trusted. */
const sizeFile = z.instanceof(File).refine((file) => file.size > 0 && file.size <= MAX_UPLOAD_BYTES);

/**
 * Collects the size files of an upload.
 * @param fields Parsed form fields.
 * @returns Width and file of every size field.
 * @throws DomainError VALIDATION_FAILED when a size field is not a file within the limit.
 */
function sizesOf(fields: Record<string, unknown>): { width: number; file: File }[] {
  return Object.entries(fields).flatMap(([key, value]) => {
    const match = SIZE_FIELD.exec(key);
    if (!match) return [];
    const parsed = sizeFile.safeParse(value);
    if (!parsed.success)
      throw new DomainError('VALIDATION_FAILED', 'Each size must be an image of up to 10 MB');
    return [{ width: Number(match[1]), file: parsed.data }];
  });
}

/** Lists assets, newest first. */
export const GET = defineEndpoint({
  method: 'GET',
  input: z.object({
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(48),
  }),
  handler: ({ input, context }) => context.locals.app.mediaLibrary.list(input.page, input.pageSize),
});

/** Stores an image uploaded as its resized sizes. */
export const POST = defineEndpoint({
  method: 'POST',
  body: 'form',
  invalidatesCache: true,
  input: z.looseObject({
    originalName: z.string().trim().min(1).max(200),
    width: z.coerce.number().int().min(1).max(20000),
    height: z.coerce.number().int().min(1).max(20000),
  }),
  handler: async ({ input, context }) => {
    const variants = await Promise.all(
      sizesOf(input).map(async ({ width, file }) => ({ width, bytes: await file.arrayBuffer() })),
    );
    return context.locals.app.mediaLibrary.upload(requireAdmin(context.locals.admin), {
      originalName: input.originalName,
      width: input.width,
      height: input.height,
      variants,
    });
  },
});
