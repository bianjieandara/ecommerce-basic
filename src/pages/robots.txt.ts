// robots.txt: closes the admin, API, cart, checkout and order areas and points to the sitemap.
import type { APIRoute } from 'astro';
import { robotsResponse } from '@/http/seo-files';

export const GET: APIRoute = ({ url }) => robotsResponse(url.origin);
