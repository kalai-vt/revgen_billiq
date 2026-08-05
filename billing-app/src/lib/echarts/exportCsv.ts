import { downloadBlob } from '@/lib/download-blob';

export interface CsvColumn<T> {
  key: keyof T & string;
  label: string;
}

function escapeCsvValue(value: unknown): string {
  const str = value === null || value === undefined ? '' : String(value);
  return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
}

export function toCsv<T extends object>(rows: T[], columns: CsvColumn<T>[]): string {
  const header = columns.map((c) => escapeCsvValue(c.label)).join(',');
  const body = rows.map((row) => columns.map((c) => escapeCsvValue(row[c.key])).join(',')).join('\n');
  return `${header}\n${body}`;
}

/** Client-side CSV export straight from a chart's own `data` prop — no server
 * round-trip, no parsing library needed for a simple flat-row -> CSV string. */
export function exportChartDataAsCsv<T extends object>(rows: T[], columns: CsvColumn<T>[], filename: string): void {
  const blob = new Blob([toCsv(rows, columns)], { type: 'text/csv;charset=utf-8;' });
  downloadBlob(blob, `${filename}.csv`);
}
