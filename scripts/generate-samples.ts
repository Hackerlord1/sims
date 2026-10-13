// Generates the FICTIONAL sample files in samples/. Every name, number and amount is invented.
// Run: npm run samples
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import ExcelJS from "exceljs";
import { PDFDocument, StandardFonts } from "pdf-lib";

const root = path.resolve(__dirname, "..", "samples");
mkdirSync(path.join(root, "statements"), { recursive: true });
mkdirSync(path.join(root, "imports"), { recursive: true });

// ── Fictional M-Pesa statement for "Brian Otieno (fictional)" ──
// Patterns: transfers to a person of interest, round figures, a split payment, rapid withdrawal
// after a credit, money going out and coming back (circular), and payments on invoice dates.
const mpesa: [string, string, string, string, string][] = [
  // receipt, completion time, details, paid in, withdrawn
  ["SIM0000001", "2026-03-02 09:14:00", "Funds received from 254700111222 - KISUMU FRESH MART FICTIONAL", "84500.00", ""],
  ["SIM0000002", "2026-03-02 10:02:00", "Customer Transfer to 0722000222 - GRACE WANJIKU FICTIONAL", "", "40000.00"],
  ["SIM0000003", "2026-03-02 11:30:00", "Customer Transfer to 0722000222 - GRACE WANJIKU FICTIONAL", "", "30000.00"],
  ["SIM0000004", "2026-03-02 13:45:00", "Withdrawal at Agent Till 441122 - FICTIONAL AGENT BUSIA", "", "12000.00"],
  ["SIM0000005", "2026-03-05 08:20:00", "Funds received from 254700333444 - LAKESIDE KIOSK FICTIONAL INV-DEMO-1003", "56250.00", ""],
  ["SIM0000006", "2026-03-06 16:10:00", "Pay Bill to 888111 - FICTIONAL SACCO Acc. 5521", "", "20000.00"],
  ["SIM0000007", "2026-03-09 09:00:00", "Customer Transfer to 0722000222 - GRACE WANJIKU FICTIONAL", "", "15000.00"],
  ["SIM0000008", "2026-03-12 18:30:00", "Funds received from 254722000222 - GRACE WANJIKU FICTIONAL", "39500.00", ""],
  ["SIM0000009", "2026-03-15 12:00:00", "Customer Transfer to 0733555666 - UNKNOWN RECIPIENT FICTIONAL", "", "5000.00"],
  ["SIM0000010", "2026-03-18 10:15:00", "Funds received from 254700111222 - KISUMU FRESH MART FICTIONAL", "31000.00", ""],
  ["SIM0000011", "2026-03-18 10:40:00", "Customer Transfer to 0722000222 - GRACE WANJIKU FICTIONAL", "", "30000.00"],
  ["SIM0000012", "2026-03-20 14:05:00", "Buy Goods from 552233 - FICTIONAL HARDWARE", "", "2350.00"],
];
let bal = 1500;
const mpesaRows = mpesa.map(([r, t, d, pin, out]) => {
  bal += Number(pin || 0) - Number(out || 0);
  return [r, t, d, "Completed", pin, out ? `-${out}` : "", bal.toFixed(2)];
});
const header = "Receipt No.,Completion Time,Details,Transaction Status,Paid In,Withdrawn,Balance";
const csv = (rows: (string | number)[][]) => rows.map((r) => r.map((c) => (/[",]/.test(String(c)) ? `"${String(c).replace(/"/g, '""')}"` : c)).join(",")).join("\r\n");
writeFileSync(path.join(root, "statements", "fictional-mpesa-statement.csv"), `${header}\r\n${csv(mpesaRows)}\r\n`);

// ── Fictional bank statement for "Grace Wanjiku (fictional)" (shows money returning: circular) ──
const bank: [string, string, string, string, string][] = [
  ["2026-03-02", "MPESA RECEIVED FROM 254711000111 BRIAN OTIENO FICTIONAL", "BNK0001", "", "40000.00"],
  ["2026-03-02", "MPESA RECEIVED FROM 254711000111 BRIAN OTIENO FICTIONAL", "BNK0002", "", "30000.00"],
  ["2026-03-03", "CASH WITHDRAWAL ATM FICTIONAL TOWN", "BNK0003", "50000.00", ""],
  ["2026-03-09", "MPESA RECEIVED FROM 254711000111 BRIAN OTIENO FICTIONAL", "BNK0004", "", "15000.00"],
  ["2026-03-12", "TRF TO BRIAN OTIENO FICTIONAL A/C 0100200300", "BNK0005", "39500.00", ""],
  ["2026-03-18", "MPESA RECEIVED FROM 254711000111 BRIAN OTIENO FICTIONAL", "BNK0006", "", "30000.00"],
  ["2026-03-19", "RTGS TO FICTIONAL MOTORS LTD ACC 9988776655", "BNK0007", "25000.00", ""],
];
let bb = 8200;
const bankRows = bank.map(([date, desc, ref, dr, cr]) => {
  bb += Number(cr || 0) - Number(dr || 0);
  return [date, desc, ref, dr, cr, bb.toFixed(2)];
});
writeFileSync(path.join(root, "statements", "fictional-bank-statement.csv"), `Transaction Date,Narrative,Reference,Debit,Credit,Balance\r\n${csv(bankRows)}\r\n`);

async function main() {
  // XLSX version of the bank statement (title rows above the header, as banks often do).
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Statement");
  ws.addRow(["FICTIONAL BANK — SAMPLE STATEMENT (NOT REAL)"]);
  ws.addRow(["Account holder: Grace Wanjiku (fictional)"]);
  ws.addRow([]);
  ws.addRow(["Transaction Date", "Narrative", "Reference", "Debit", "Credit", "Balance"]);
  for (const r of bankRows) ws.addRow(r);
  writeFileSync(path.join(root, "statements", "fictional-bank-statement.xlsx"), Buffer.from(await wb.xlsx.writeBuffer()));

  // Text-based PDF version of the M-Pesa statement.
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const page = pdf.addPage([842, 595]);
  let y = 560;
  const line = (t: string, size = 8) => {
    page.drawText(t, { x: 30, y, size, font });
    y -= 14;
  };
  line("FICTIONAL M-PESA STATEMENT - SAMPLE DATA ONLY - NOT A REAL STATEMENT", 11);
  line("Customer: Brian Otieno (fictional)   Mobile: 0711000111 (fictional)");
  line("Receipt No. Completion Time Details Paid In Withdrawn Balance");
  for (const r of mpesaRows) line(`${r[1]} ${r[0]} ${r[2]} ${r[4] || r[5].replace("-", "")} ${r[6]}`);
  writeFileSync(path.join(root, "statements", "fictional-mpesa-statement.pdf"), await pdf.save());

  // Bulk-import sample: valid rows, a duplicate (INV-DEMO-9001 twice) and invalid rows.
  const inv = [
    ["Case reference", "Invoice number", "Invoice date", "Customer", "Invoice amount", "Amount paid", "Classification"],
    ["", "INV-DEMO-9001", "2026-02-10", "Fictional Bulk Customer A", "12500.00", "0", "No proof of delivery"],
    ["", "INV-DEMO-9002", "11/02/2026", "Fictional Bulk Customer B", "8,300.50", "1000", "Disputed"],
    ["", "INV-DEMO-9003", "2026-02-12", "Fictional Bulk Customer C", "4200", "", "Valid but unpaid"],
    ["", "INV-DEMO-9001", "2026-02-10", "Fictional Bulk Customer A", "12500.00", "0", "No proof of delivery"],
    ["", "INV-DEMO-9004", "31/02/2026", "Fictional Bulk Customer D", "abc", "0", "Not a class"],
    ["", "", "2026-02-14", "Fictional Bulk Customer E", "900", "0", ""],
  ];
  writeFileSync(path.join(root, "imports", "invoices-valid-duplicate-invalid.csv"), csv(inv) + "\r\n");
  writeFileSync(
    path.join(root, "README.md"),
    "# Sample files (FICTIONAL)\n\nEvery name, telephone number, account number, reference and amount in these files is invented for testing SIMS. They do not describe real people, companies or transactions.\n\n- `statements/` — M-Pesa and bank statements (CSV, XLSX, text PDF) that exercise transfer, split, round-figure, rapid-withdrawal and circular-movement detection.\n- `imports/invoices-valid-duplicate-invalid.csv` — bulk-import sample with valid rows, a duplicate and invalid rows. Choose a default case when uploading.\n\nRegenerate with `npm run samples`.\n",
  );
  console.log("Fictional samples written to samples/.");
}

void main();
