// CSV import: the file is checked on the server first, with the import's own rules, and only then applied. Rows that cannot
// apply are listed with the reason; the others go through.
import { useState } from 'preact/hooks';
import type { ImportStockResult } from '@/application/inventory/import-stock';
import { MAX_IMPORT_BYTES } from '@/application/inventory/stock-import';
import { postForm } from '../lib/api-client';
import { BUTTON, BUTTON_PRIMARY, ERROR_TEXT, FIELD, LABEL, PANEL, TABLE_WRAP } from '../lib/classes';
import { fill, importFileText, importRowText, type InventoryLabels } from './inventory-view';

/** Props of the import panel. */
export interface CsvImportProps {
  labels: InventoryLabels;
}

/**
 * File picker, server-side check, then the import itself. The check is the import's own, so what it lists is what applies.
 * @param props Labels.
 */
export default function CsvImport(props: CsvImportProps) {
  const { labels } = props;
  const csv = labels.csv;
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<ImportStockResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [applied, setApplied] = useState(false);

  /**
   * Keeps the chosen file when it fits the size limit, and explains when it does not.
   * @param picked File from the picker, or null when none was chosen.
   */
  function choose(picked: File | null) {
    setResult(null);
    setApplied(false);
    setMessage(null);
    if (picked && picked.size > MAX_IMPORT_BYTES) {
      setFile(null);
      setMessage(csv.tooLarge);
      return;
    }
    setFile(picked);
  }

  /**
   * Sends the file: a check (dryRun) or the import itself.
   * @param dryRun Whether this request only checks the file.
   */
  async function send(dryRun: boolean) {
    if (!file) return;
    setBusy(true);
    setMessage(null);
    const form = new FormData();
    form.set('file', file);
    form.set('dryRun', dryRun ? '1' : '0');
    const response = await postForm<ImportStockResult>('/api/admin/inventory/import', form);
    setBusy(false);
    if (!response.ok) {
      setMessage(importFileText(labels, response.details));
      return;
    }
    setResult(response.data);
    if (!dryRun) setApplied(true);
  }

  const ready = result ? result.rows.filter((row) => row.status === 'ok').length : 0;
  const attention = result ? result.rows.length - ready : 0;

  return (
    <section class={PANEL}>
      <p class="text-text/70 text-sm">{csv.help}</p>
      <label class={LABEL}>
        {csv.choose}
        <input
          type="file"
          accept=".csv,text/csv"
          class={FIELD}
          onChange={(event) => choose(event.currentTarget.files?.[0] ?? null)}
        />
      </label>
      <div class="flex flex-wrap gap-2">
        <button
          type="button"
          class={BUTTON}
          disabled={!file || busy || applied}
          onClick={() => void send(true)}
        >
          {busy ? csv.checking : csv.check}
        </button>
        {result && !applied && (
          <button
            type="button"
            class={BUTTON_PRIMARY}
            disabled={busy || ready === 0}
            onClick={() => void send(false)}
          >
            {busy ? csv.applying : csv.apply}
          </button>
        )}
      </div>
      {message && (
        <p class={ERROR_TEXT} role="alert">
          {message}
        </p>
      )}
      {result && !applied && (
        <p class="text-sm font-semibold" role="status">
          {fill(csv.ready, { count: ready })}
          {attention > 0 && ` ${fill(csv.attention, { count: attention })}`}
        </p>
      )}
      {applied && result && (
        <div class="flex flex-col items-start gap-3">
          <p class="text-sm font-semibold" role="status">
            {fill(csv.applied, { count: result.applied, batch: result.batchId ?? '' })}
          </p>
          <button type="button" class={BUTTON} onClick={() => window.location.reload()}>
            {labels.reloadList}
          </button>
        </div>
      )}
      {result && (
        <div class={TABLE_WRAP}>
          <table class="admin-table w-full text-sm">
            <thead>
              <tr>
                <th scope="col">{csv.line}</th>
                <th scope="col">{labels.columnSku}</th>
                <th scope="col">{csv.result}</th>
                <th scope="col">{csv.before}</th>
                <th scope="col">{csv.after}</th>
              </tr>
            </thead>
            <tbody>
              {result.rows.map((row) => (
                <tr key={`${row.line}-${row.sku}`}>
                  <td data-label={csv.line}>{row.line}</td>
                  <td data-label={labels.columnSku}>{row.sku}</td>
                  <td data-label={csv.result}>
                    {row.status === 'ok' ? csv.ok : importRowText(labels, row.code)}
                  </td>
                  <td data-label={csv.before}>{row.before ?? '—'}</td>
                  <td data-label={csv.after}>{row.after ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
