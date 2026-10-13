import "server-only";
import { AlignmentType, Document, HeadingLevel, Packer, PageOrientation, Paragraph, Table, TableCell, TableRow, TextRun, WidthType } from "docx";
import { PDFDocument, rgb, StandardFonts, type PDFFont } from "pdf-lib";
import type { ReportData } from "@/server/reports/definitions";
import { safeCell } from "@/server/services/exporter";
import { formatMoney } from "@/lib/money";

export interface RenderMeta {
  title: string;
  reference: string;
  generatedBy: string;
  generatedAt: Date;
  filters: string;
}

const CONFIDENTIAL = "CONFIDENTIAL — SIMS investigation record. Do not distribute without authorisation.";

const cellText = (v: unknown, money?: boolean): string => {
  if (v === null || v === undefined) return "";
  const s = String(v);
  return money && /^-?\d+(\.\d+)?$/.test(s) ? formatMoney(s, null) : s;
};

/** Standard PDF fonts only cover WinAnsi; replace anything else so rendering never fails. */
const winAnsi = (s: string) =>
  s
    .replace(/[–—]/g, "-")
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/…/g, "...")
    .replace(/•/g, "*")
    .replace(/[^\x20-\x7E\xA0-\xFF]/g, "?");

function fit(font: PDFFont, text: string, size: number, width: number): string {
  let t = winAnsi(text).replace(/\s+/g, " ");
  if (font.widthOfTextAtSize(t, size) <= width) return t;
  while (t.length > 1 && font.widthOfTextAtSize(t + "...", size) > width) t = t.slice(0, -1);
  return t + "...";
}

export async function renderPdf(meta: RenderMeta, data: ReportData): Promise<Buffer> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(meta.title);
  pdf.setAuthor("SIMS");
  pdf.setCreator("SIMS — Savemore Investigation Management System");
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const [W, H] = [841.89, 595.28]; // A4 landscape
  const margin = 36;
  const usable = W - margin * 2;
  const size = data.columns.length > 9 ? 7 : 8;
  // Column widths proportional to content length, capped.
  const weights = data.columns.map((c) => Math.min(40, Math.max(c.label.length, ...data.rows.slice(0, 200).map((r) => cellText(r[c.key], c.money).length)) + 2));
  const total = weights.reduce((a, b) => a + b, 0);
  const widths = weights.map((w) => (w / total) * usable);
  let page = pdf.addPage([W, H]);
  let y = H - margin;
  let pageNo = 1;
  const footer = () => {
    page.drawText(winAnsi(CONFIDENTIAL), { x: margin, y: 18, size: 7, font, color: rgb(0.45, 0.1, 0.1) });
    page.drawText(`${meta.reference} · page ${pageNo}`, { x: W - margin - 110, y: 18, size: 7, font, color: rgb(0.3, 0.3, 0.3) });
  };
  const header = () => {
    let x = margin;
    page.drawRectangle({ x: margin, y: y - 4, width: usable, height: size + 8, color: rgb(0.89, 0.91, 0.94) });
    data.columns.forEach((c, i) => {
      page.drawText(fit(bold, c.label, size, widths[i]! - 4), { x: x + 2, y, size, font: bold, color: rgb(0.1, 0.1, 0.15) });
      x += widths[i]!;
    });
    y -= size + 10;
  };
  page.drawText(winAnsi(meta.title), { x: margin, y, size: 16, font: bold, color: rgb(0.04, 0.1, 0.17) });
  y -= 20;
  for (const line of [`Reference ${meta.reference} · generated ${meta.generatedAt.toISOString().replace("T", " ").slice(0, 16)} UTC by ${meta.generatedBy}`, meta.filters, ...data.summary]) {
    page.drawText(fit(font, line, 9, usable), { x: margin, y, size: 9, font, color: rgb(0.25, 0.28, 0.33) });
    y -= 13;
  }
  y -= 6;
  header();
  for (const r of data.rows) {
    if (y < margin + 20) {
      footer();
      page = pdf.addPage([W, H]);
      pageNo++;
      y = H - margin;
      header();
    }
    let x = margin;
    data.columns.forEach((c, i) => {
      const text = fit(font, safeCell(cellText(r[c.key], c.money)), size, widths[i]! - 4);
      const tx = c.money ? x + widths[i]! - 2 - font.widthOfTextAtSize(text, size) : x + 2;
      page.drawText(text, { x: tx, y, size, font, color: rgb(0.08, 0.1, 0.13) });
      x += widths[i]!;
    });
    y -= size + 5;
  }
  if (!data.rows.length) page.drawText("No records match the selected filters.", { x: margin, y, size: 9, font });
  footer();
  return Buffer.from(await pdf.save());
}

export async function renderDocx(meta: RenderMeta, data: ReportData): Promise<Buffer> {
  const header = new TableRow({
    tableHeader: true,
    children: data.columns.map((c) => new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: c.label, bold: true, size: 16 })] })], shading: { fill: "E3E8EF" } })),
  });
  const rows = data.rows.map(
    (r) =>
      new TableRow({
        children: data.columns.map(
          (c) =>
            new TableCell({
              children: [
                new Paragraph({ alignment: c.money ? AlignmentType.RIGHT : AlignmentType.LEFT, children: [new TextRun({ text: safeCell(cellText(r[c.key], c.money)).slice(0, 2000), size: 16 })] }),
              ],
            }),
        ),
      }),
  );
  const doc = new Document({
    creator: "SIMS",
    title: meta.title,
    sections: [
      {
        properties: { page: { size: { orientation: PageOrientation.LANDSCAPE } } },
        children: [
          new Paragraph({ heading: HeadingLevel.TITLE, children: [new TextRun(meta.title)] }),
          new Paragraph({
            children: [
              new TextRun({ text: `Reference ${meta.reference} · generated ${meta.generatedAt.toISOString().slice(0, 16).replace("T", " ")} UTC by ${meta.generatedBy}`, size: 18, color: "555555" }),
            ],
          }),
          new Paragraph({ children: [new TextRun({ text: meta.filters, size: 18, color: "555555" })] }),
          ...data.summary.map((s) => new Paragraph({ children: [new TextRun({ text: s, size: 18 })] })),
          new Paragraph({ text: "" }),
          data.rows.length ? new Table({ rows: [header, ...rows], width: { size: 100, type: WidthType.PERCENTAGE } }) : new Paragraph("No records match the selected filters."),
          new Paragraph({ text: "" }),
          new Paragraph({ children: [new TextRun({ text: CONFIDENTIAL, italics: true, size: 16, color: "8B1A1A" })] }),
        ],
      },
    ],
  });
  return Buffer.from(await Packer.toBuffer(doc));
}
