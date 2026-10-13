import "server-only";
import { spawn } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import ExcelJS from "exceljs";
import Papa from "papaparse";
import { normalizeRows, parsePdfText, type NormalizeResult, type RawRow } from "@/lib/statements/normalize";

export type StatementFileFormat = "PDF" | "SCANNED_PDF" | "CSV" | "XLSX" | "MPESA_PDF" | "BANK_PDF";

export interface ParseInput {
  buffer: Buffer;
  format: StatementFileFormat;
}

export interface ParseOutput extends NormalizeResult {
  parser: string;
  needsManualReview: boolean;
}

/** Replaceable parser interface. Implementations extract rows; normalisation is shared. */
export interface StatementParser {
  readonly name: string;
  available(): Promise<boolean>;
  parse(input: ParseInput): Promise<ParseOutput>;
}

const isPdf = (f: StatementFileFormat) => f === "PDF" || f === "SCANNED_PDF" || f === "MPESA_PDF" || f === "BANK_PDF";

function finish(parser: string, res: NormalizeResult, scannedHint = false): ParseOutput {
  const needsManualReview = scannedHint || res.transactions.length === 0;
  return { ...res, parser, needsManualReview };
}

/** OCR integration point: SIMS has no OCR engine, so scanned statements are routed to manual review. */
function scanned(parser: string): ParseOutput {
  return {
    parser,
    transactions: [],
    warnings: ["The PDF has no text layer (scanned) and SIMS does not include OCR. Enter or import the transactions manually, or upload a CSV/Excel export of the statement."],
    needsManualReview: true,
  };
}

// ───────────────────── Node implementation ─────────────────────

export class NodeStatementParser implements StatementParser {
  readonly name = "node";
  async available() {
    return true;
  }
  async parse({ buffer, format }: ParseInput): Promise<ParseOutput> {
    if (format === "CSV") {
      const text = buffer.toString("utf8").replace(/^﻿/, "");
      const parsed = Papa.parse<RawRow>(text, { header: true, skipEmptyLines: "greedy", transformHeader: (h) => h.trim() });
      const warnings = parsed.errors.slice(0, 20).map((e) => `Row ${(e.row ?? 0) + 1}: ${e.message}`);
      const res = normalizeRows(parsed.data, parsed.meta.fields ?? []);
      return finish(this.name, { ...res, warnings: [...warnings, ...res.warnings] });
    }
    if (format === "XLSX") {
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(buffer as unknown as ArrayBuffer);
      const ws = wb.worksheets[0];
      if (!ws) return finish(this.name, { transactions: [], warnings: ["The workbook has no worksheets."] });
      // The header row is the first row with at least three non-empty cells.
      let headerRow = 1;
      for (let r = 1; r <= Math.min(ws.rowCount, 30); r++) {
        const values = (ws.getRow(r).values as unknown[]).slice(1).filter((v) => v !== null && v !== undefined && String(v).trim());
        if (values.length >= 3) {
          headerRow = r;
          break;
        }
      }
      const headers = (ws.getRow(headerRow).values as unknown[]).slice(1).map((v) => String(v ?? "").trim());
      const rows: RawRow[] = [];
      for (let r = headerRow + 1; r <= ws.rowCount; r++) {
        const values = (ws.getRow(r).values as unknown[]).slice(1);
        if (!values.some((v) => v !== null && v !== undefined && String(v).trim())) continue;
        const row: RawRow = {};
        headers.forEach((h, i) => {
          const v = values[i];
          row[h] = v && typeof v === "object" && "result" in (v as object) ? (v as { result: unknown }).result : v instanceof Date ? v.toISOString() : v;
        });
        rows.push(row);
      }
      return finish(this.name, normalizeRows(rows, headers));
    }
    // PDF
    const { extractText, getDocumentProxy } = await import("unpdf");
    const pdf = await getDocumentProxy(new Uint8Array(buffer));
    const { text } = await extractText(pdf, { mergePages: true });
    const joined = Array.isArray(text) ? text.join("\n") : text;
    if (format === "SCANNED_PDF" || !joined.trim()) return scanned(this.name);
    return finish(this.name, parsePdfText(joined));
  }
}

// ───────────────────── Python + pandas implementation ─────────────────────

const PYTHON = process.env.PYTHON_BIN || (process.platform === "win32" ? "python" : "python3");
const SCRIPT = path.resolve(process.cwd(), "parsers", "statement_parser.py");

function run(cmd: string, args: string[], timeoutMs: number): Promise<{ code: number | null; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { windowsHide: true });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => child.kill("SIGKILL"), timeoutMs);
    child.stdout.on("data", (d) => (stdout += d));
    child.stderr.on("data", (d) => (stderr += d));
    child.on("error", () => {
      clearTimeout(timer);
      resolve({ code: -1, stdout, stderr });
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ code, stdout, stderr });
    });
  });
}

let pythonAvailable: boolean | null = null;

export class PythonPandasParser implements StatementParser {
  readonly name = "python-pandas";
  async available() {
    if (process.env.STATEMENT_PARSER === "node") return false;
    if (pythonAvailable !== null) return pythonAvailable;
    const r = await run(PYTHON, ["-c", "import pandas, openpyxl, pdfplumber"], 20_000);
    pythonAvailable = r.code === 0;
    return pythonAvailable;
  }
  async parse({ buffer, format }: ParseInput): Promise<ParseOutput> {
    // Work on a temporary derived copy; the stored original is never passed to external code.
    const dir = await mkdtemp(path.join(tmpdir(), "sims-stmt-"));
    const ext = format === "CSV" ? "csv" : format === "XLSX" ? "xlsx" : "pdf";
    const file = path.join(dir, `statement.${ext}`);
    try {
      await writeFile(file, buffer);
      const r = await run(PYTHON, [SCRIPT, file, isPdf(format) ? "PDF" : format], 120_000);
      let payload: { headers?: string[]; rows?: RawRow[]; warnings?: string[]; text?: string | null; error?: string };
      try {
        payload = JSON.parse(r.stdout || "{}");
      } catch {
        throw new Error(`The Python parser returned unreadable output (exit ${r.code}).`);
      }
      if (payload.error) throw new Error(`Python parser: ${payload.error}`);
      const warnings = payload.warnings ?? [];
      if (isPdf(format)) {
        if (format === "SCANNED_PDF" || !(payload.text ?? "").trim()) return scanned(this.name);
        // Prefer extracted tables; fall back to line parsing of the text layer.
        const fromTables = payload.rows?.length ? normalizeRows(payload.rows, payload.headers) : null;
        const res = fromTables && fromTables.transactions.length ? fromTables : parsePdfText(payload.text ?? "");
        return finish(this.name, { ...res, warnings: [...warnings, ...res.warnings] });
      }
      const res = normalizeRows(payload.rows ?? [], payload.headers);
      return finish(this.name, { ...res, warnings: [...warnings, ...res.warnings] });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }
}

/** Picks the configured parser: Python + pandas when available (default), otherwise Node. */
export async function selectParser(): Promise<StatementParser> {
  const py = new PythonPandasParser();
  if (process.env.STATEMENT_PARSER !== "node" && (await py.available())) return py;
  return new NodeStatementParser();
}
