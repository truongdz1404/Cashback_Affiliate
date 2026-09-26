// CSV export for the admin tables. Excel on a Vietnamese Windows opens a UTF-8
// file as mojibake unless it finds a BOM, and it splits on the list separator
// from the OS locale - which here is ';', not ','. Both are handled below, so
// a downloaded file opens straight into columns with the accents intact.

type Column<T> = {
  header: string;
  value: (row: T) => string | number | null | undefined;
};

const SEPARATOR = ";";

function cell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "";
  const text = String(value);
  // A leading =, + or - makes Excel treat the cell as a formula; prefixing an
  // apostrophe keeps a phone number like "+84…" as text.
  const safe = /^[=+\-@]/.test(text) ? `'${text}` : text;
  return `"${safe.replace(/"/g, '""')}"`;
}

export function toCsv<T>(rows: T[], columns: Column<T>[]): string {
  const head = columns.map((c) => cell(c.header)).join(SEPARATOR);
  const body = rows.map((row) => columns.map((c) => cell(c.value(row))).join(SEPARATOR));
  return [`sep=${SEPARATOR}`, head, ...body].join("\r\n");
}

export function downloadCsv<T>(filename: string, rows: T[], columns: Column<T>[]): void {
  const blob = new Blob(["﻿" + toCsv(rows, columns)], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename.endsWith(".csv") ? filename : `${filename}.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

/** "don-hang-2026-09-26.csv" - dated so two exports never overwrite each other. */
export function datedFilename(base: string): string {
  const now = new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10);
  return `${base}-${now}.csv`;
}

export type { Column as CsvColumn };
