// Temporary root endpoint for Stage 0. Replaced by a locale redirect in Stage 7.
export function GET(): Response {
  return new Response('ok', { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
}
