import "server-only";
import ExcelJS from "exceljs";

export interface ExportColumn {
  key: string;
  label: string;
  /** Right-align and use a number format in XLSX (values are exact decimal strings). */
  money?: boolean;
}

type Cell = string | number | boolean | null | undefined | Date;

/** Neutralises spreadsheet formula injection (=, +, -, @, tab, CR at the start of a cell). */
export function safeCell(v: Cell): string {
  if (v === null || v === undefined) return "";
  const s = v instanceof Date ? v.toISOString() : String(v);
  return /^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s) ? `'${s}` : s;
}

export function toCsv(columns: ExportColumn[], rows: Record<string, unknown>[]): string {
  const esc = (v: string) => (/[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  const lines = [columns.map((c) => esc(c.label)).join(",")];
  for (const r of rows) lines.push(columns.map((c) => esc(safeCell(r[c.key] as Cell))).join(","));
  // BOM so Excel opens UTF-8 correctly.
  return "﻿" + lines.join("\r\n");
}

export async function toXlsx(title: string, columns: ExportColumn[], rows: Record<string, unknown>[], notes: string[] = []): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "SIMS";
  wb.created = new Date();
  const ws = wb.addWorksheet(title.slice(0, 31).replace(/[\\/?*[\]:]/g, " "));
  let rowOffset = 0;
  for (const n of notes) {
    ws.addRow([n]).font = { italic: true, color: { argb: "FF555555" } };
    rowOffset++;
  }
  if (notes.length) {
    ws.addRow([]);
    rowOffset++;
  }
  const header = ws.addRow(columns.map((c) => c.label));
  header.font = { bold: true };
  header.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE3E8EF" } };
  for (const r of rows) {
    ws.addRow(
      columns.map((c) => {
        const v = r[c.key] as Cell;
        // Numeric cells only where a double is exact to the cent (≤ 15 significant digits); otherwise exact text.
        if (c.money && typeof v === "string" && /^-?\d{1,13}(\.\d{1,2})?$/.test(v)) return Number(v);
        return safeCell(v);
      }),
    );
  }
  columns.forEach((c, i) => {
    const col = ws.getColumn(i + 1);
    col.width = Math.min(60, Math.max(12, c.label.length + 2));
    if (c.money) col.numFmt = "#,##0.00";
  });
  ws.views = [{ state: "frozen", ySplit: rowOffset + 1 }];
  ws.autoFilter = { from: { row: rowOffset + 1, column: 1 }, to: { row: rowOffset + 1, column: columns.length } };
  return Buffer.from(await wb.xlsx.writeBuffer());
}

export function attachment(buffer: Buffer | string, filename: string, mime: string): Response {
  const body = typeof buffer === "string" ? buffer : new Uint8Array(buffer);
  return new Response(body, {
    headers: {
      "content-type": mime,
      "content-disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
      "x-content-type-options": "nosniff",
      "cache-control": "no-store",
    },
  });
}

const stamp = () => new Date().toISOString().slice(0, 10);

export async function exportResponse(format: "csv" | "xlsx", basename: string, columns: ExportColumn[], rows: Record<string, unknown>[], notes: string[] = []) {
  if (format === "csv") return attachment(toCsv(columns, rows), `${basename}-${stamp()}.csv`, "text/csv; charset=utf-8");
  return attachment(await toXlsx(basename, columns, rows, notes), `${basename}-${stamp()}.xlsx`, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
}
