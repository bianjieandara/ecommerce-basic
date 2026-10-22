// CSV downloads. The file is served as text/csv with a filename and is never cached, since it reflects the stock right now.

/**
 * A CSV file as a download.
 * @param text File contents (already encoded by toCsv, with its byte-order mark).
 * @param filename Name the browser saves the file under.
 * @returns The response.
 */
export function csvResponse(text: string, filename: string): Response {
  return new Response(text, {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="${filename}"`,
      'cache-control': 'no-store',
    },
  });
}
