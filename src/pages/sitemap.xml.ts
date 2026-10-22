// sitemap.xml: indexable catalog and content URLs with language alternates.
import type { APIRoute } from 'astro';
import { sitemapResponse } from '@/http/seo-files';

export const GET: APIRoute = ({ locals, url }) => sitemapResponse(locals.app, url.origin);
