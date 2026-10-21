// Formatting for the UI. Re-exports the domain implementation so pages, emails and invoices share one code path.
export {
  formatDate,
  formatDateTime,
  formatMoney,
  formatNumber,
  formatPercent,
  intlLocale,
} from '@/domain/shared/format';
