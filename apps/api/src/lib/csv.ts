export type CsvValue = string | number | null | undefined;

// Spreadsheet apps run cells starting with these as formulas (CSV injection).
const FORMULA_START = /^[=+\-@\t\r]/;

/** Escapes one cell: neutralises formulas and quotes values containing separators or quotes. */
export function csvCell(value: CsvValue): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : '';
  const safe = FORMULA_START.test(value) ? `'${value}` : value;
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

/**
 * Builds a CSV document. Starts with a UTF-8 BOM and uses CRLF so Excel opens Vietnamese
 * text correctly.
 */
export function toCsv(rows: CsvValue[][]): string {
  return '﻿' + rows.map((row) => row.map(csvCell).join(',')).join('\r\n') + '\r\n';
}

/** `Content-Disposition` value with an ASCII fallback and the UTF-8 name (RFC 6266 / 5987). */
export function attachmentHeader(filename: string): string {
  const ascii = filename
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .replace(/[^\w.-]+/g, '-');
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}
