// A report table as CSV. It reads through the same BuildReport call as the screen, so the file and the screen cannot disagree.
// The file names its table with ?table=; without it, the first table of the report is exported.
import { reportCsv } from '@/application/reports/csv';
import { isReportKind } from '@/application/reports/build-report';
import { reportRequestFrom } from '@/application/reports/request';
import { DomainError } from '@/domain/shared/errors';
import { csvResponse } from '@/http/csv-response';
import { requireAdmin } from '@/http/admin-session';
import { defineEndpoint } from '@/http/define-endpoint';
import { t } from '@/ui/i18n';
import type { ReportTextKey } from '@/application/reports/view';

export const GET = defineEndpoint({
  method: 'GET',
  handler: async ({ context }) => {
    const admin = requireAdmin(context.locals.admin);
    const kind = context.params.report ?? '';
    if (!isReportKind(kind)) throw new DomainError('NOT_FOUND', 'Unknown report');
    const request = reportRequestFrom(context.url.searchParams);
    const result = await context.locals.app.reports.execute(kind, request, admin.locale);
    const file = reportCsv(result.view, {
      table: request.table,
      from: result.range.from,
      to: result.range.to,
      currency: result.currency,
      label: (key: ReportTextKey) => t(admin.locale, `admin.reports.${key}`),
    });
    if (!file) throw new DomainError('NOT_FOUND', 'Unknown table');
    return csvResponse(file.text, file.filename);
  },
});
