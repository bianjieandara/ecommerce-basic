// A stand-in for the part of Meta's Graph API the store uses for WhatsApp, so the Stage 18 flow can be tested on this machine with
// no Meta account: templates (list, create, review), the resumable upload of a header example, media upload and template messages.
// It applies the rules Meta documents and the ones that most often reject real templates: a body variable must be numbered from 1,
// in order, with a sample value each, and the text cannot start or end with one; a URL button ends in {{1}}; a message can only use a
// template that is APPROVED in that language, with as many parameters as the template has variables. It records every request.
//
// Usage: imported by scripts/test/whatsapp.mjs (startFakeGraph). The demo store reaches it through META_GRAPH_BASE_URL (store.mjs).
import { createServer } from 'node:http';

/** Port the demo store is started with (see DEMO_GRAPH_URL in scripts/docs/shared.mjs). */
export const GRAPH_PORT = Number(process.env.DOCS_GRAPH_PORT ?? 5801);

/**
 * Starts the fake. Call `close()` when done.
 * @param port Port to listen on.
 * @returns The server handle, the recorded requests, the stored templates and a function that approves or rejects a template.
 */
export async function startFakeGraph(port = GRAPH_PORT) {
  /** Every request received, oldest first. */
  const requests = [];
  /** Templates by `${name}|${language}`. */
  const templates = new Map();
  const uploads = new Map();
  let counter = 1000;

  const fail = (status, code, message) => [
    status,
    { error: { message, type: 'OAuthException', code, fbtrace_id: 'fake' } },
  ];

  /** Rules Meta applies when a template is created; the first one broken is returned. */
  function templateProblem(body) {
    if (!/^[a-z0-9_]+$/.test(body.name ?? ''))
      return 'Name may only contain lowercase letters, digits and underscores';
    if (!body.language) return 'Language is required';
    if (body.category !== 'UTILITY' && body.category !== 'MARKETING' && body.category !== 'AUTHENTICATION')
      return 'Category is invalid';
    const parts = body.components ?? [];
    const bodyPart = parts.find((p) => p.type === 'BODY');
    if (!bodyPart?.text) return 'A BODY component is required';
    const found = [...bodyPart.text.matchAll(/\{\{(\d+)\}\}/g)].map((m) => Number(m[1]));
    if (found.some((n, i) => n !== i + 1)) return 'Variables must be numbered {{1}}, {{2}}, ... in order';
    if (/^\{\{\d+\}\}/.test(bodyPart.text.trim()) || /\{\{\d+\}\}$/.test(bodyPart.text.trim())) {
      return 'The body cannot start or end with a variable';
    }
    if (found.length > 0 && (bodyPart.example?.body_text?.[0]?.length ?? 0) !== found.length) {
      return 'Each variable needs a sample value in example.body_text';
    }
    const header = parts.find((p) => p.type === 'HEADER');
    if (header && header.format === 'DOCUMENT' && !header.example?.header_handle?.[0])
      return 'A DOCUMENT header needs an example handle';
    const buttons = parts.find((p) => p.type === 'BUTTONS')?.buttons ?? [];
    for (const button of buttons) {
      if (button.type === 'URL' && (!/\{\{1\}\}$/.test(button.url ?? '') || !button.example?.[0])) {
        return 'A URL button must end in {{1}} and carry an example';
      }
    }
    return null;
  }

  /** Rules Meta applies to a template message. */
  function messageProblem(body) {
    if (body.messaging_product !== 'whatsapp') return fail(400, 100, 'messaging_product must be whatsapp');
    if (!/^\d{8,15}$/.test(body.to ?? ''))
      return fail(400, 100, 'Recipient must be digits with the country code');
    if (body.type !== 'template') return fail(400, 131047, 'Only template messages may start a conversation');
    const wanted = body.template ?? {};
    const record = templates.get(`${wanted.name}|${wanted.language?.code}`);
    if (!record) return fail(404, 132001, 'Template name does not exist in the translation');
    if (record.status !== 'APPROVED') return fail(400, 132001, `Template is ${record.status}`);
    const components = wanted.components ?? [];
    const sentBody = components.find((c) => c.type === 'body')?.parameters ?? [];
    const variables = [...record.body.matchAll(/\{\{(\d+)\}\}/g)].length;
    if (sentBody.length !== variables)
      return fail(
        400,
        132000,
        `Number of parameters (${sentBody.length}) does not match the expected number (${variables})`,
      );
    if (record.header === 'DOCUMENT') {
      const header = components.find((c) => c.type === 'header')?.parameters?.[0];
      if (header?.type !== 'document' || !header.document?.id)
        return fail(400, 132012, 'The document header parameter is missing');
    }
    if (record.button && !components.some((c) => c.type === 'button'))
      return fail(400, 132000, 'The button parameter is missing');
    return null;
  }

  /** Picks the answer to one request. */
  function answer(method, path, query, body) {
    const route = path.replace(/^\/v[\d.]+\//, '/');
    if (method === 'GET' && /\/message_templates$/.test(route)) {
      const name = query.get('name');
      const data = [...templates.values()]
        .filter((t) => !name || t.name === name)
        .map((t) => ({
          id: t.id,
          name: t.name,
          language: t.language,
          status: t.status,
          category: t.category,
          rejected_reason: t.reason ?? 'NONE',
        }));
      return [200, { data }];
    }
    if (method === 'POST' && /\/message_templates$/.test(route)) {
      const problem = templateProblem(body);
      if (problem) return fail(400, 100, problem);
      const key = `${body.name}|${body.language}`;
      if (templates.has(key)) return fail(400, 2388023, 'Content in this language already exists');
      const record = {
        id: String(++counter),
        name: body.name,
        language: body.language,
        category: body.category,
        status: 'PENDING',
        reason: null,
        body: body.components.find((c) => c.type === 'BODY').text,
        header: body.components.find((c) => c.type === 'HEADER')?.format ?? null,
        button: body.components.find((c) => c.type === 'BUTTONS')?.buttons?.[0] ?? null,
      };
      templates.set(key, record);
      return [200, { id: record.id, status: 'PENDING', category: record.category }];
    }
    if (method === 'POST' && /\/uploads$/.test(route)) {
      const id = `upload:fake${++counter}`;
      uploads.set(id, true);
      return [200, { id }];
    }
    if (method === 'POST' && uploads.has(route.slice(1))) return [200, { h: `4::fake-handle-${++counter}` }];
    if (method === 'POST' && /\/media$/.test(route)) return [200, { id: `media-${++counter}` }];
    if (method === 'POST' && /\/messages$/.test(route)) {
      const problem = messageProblem(body);
      if (problem) return problem;
      return [
        200,
        {
          messaging_product: 'whatsapp',
          contacts: [{ input: body.to, wa_id: body.to }],
          messages: [{ id: `wamid.FAKE${++counter}` }],
        },
      ];
    }
    return fail(404, 100, `The fake Graph API has no route for ${method} ${route}`);
  }

  const server = createServer((request, response) => {
    const chunks = [];
    request.on('data', (chunk) => chunks.push(chunk));
    request.on('end', () => {
      const raw = Buffer.concat(chunks);
      const url = new URL(request.url ?? '/', 'http://localhost');
      const type = request.headers['content-type'] ?? '';
      let body = null;
      let file = null;
      if (type.includes('application/json')) {
        try {
          body = JSON.parse(raw.toString('utf8'));
        } catch {
          body = null;
        }
      } else if (type.includes('multipart/form-data')) {
        const text = raw.toString('latin1');
        const name = /filename="([^"]*)"/.exec(text)?.[1] ?? null;
        const fileType = /Content-Type: ([^\r\n]+)\r\n\r\n/.exec(text)?.[1] ?? null;
        const start = text.indexOf('\r\n\r\n', text.indexOf('filename=')) + 4;
        const end = text.lastIndexOf('\r\n--');
        file = {
          name,
          type: fileType,
          bytes: raw.subarray(start, end).length,
          startsWith: text.slice(start, start + 5),
        };
      }
      const authorized = /^(Bearer|OAuth) \S+/.test(request.headers.authorization ?? '');
      const [status, json] = authorized
        ? answer(request.method ?? 'GET', url.pathname, url.searchParams, body)
        : fail(401, 190, 'Missing access token');
      requests.push({
        method: request.method,
        path: url.pathname,
        query: Object.fromEntries(url.searchParams),
        body,
        file,
        status,
        json,
      });
      response.writeHead(status, { 'content-type': 'application/json' });
      response.end(JSON.stringify(json));
    });
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, resolve);
  });

  return {
    requests,
    templates,
    /**
     * Sets the review result of every language of a template, as Meta does after its review.
     * @param name Template name.
     * @param status APPROVED, REJECTED, PAUSED or DISABLED.
     * @param reason Rejection reason, if any.
     */
    review(name, status, reason = null) {
      for (const record of templates.values())
        if (record.name === name) Object.assign(record, { status, reason });
    },
    /** Forgets the recorded requests and the templates. */
    reset() {
      requests.length = 0;
      templates.clear();
    },
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}
