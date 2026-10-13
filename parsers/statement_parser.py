#!/usr/bin/env python3
"""SIMS statement parser (pandas).

Reads a bank or M-Pesa statement (CSV, XLSX or text-based PDF) and prints raw rows as JSON on
stdout: {"headers": [...], "rows": [{...}], "warnings": [...], "text": "..."}.

Normalisation (column detection, amounts, narratives) is done by the SIMS server so both
parsers produce identical results. This script only extracts tabular data. It never modifies
the input file.

Usage: python statement_parser.py <path> <format>
"""
import json
import sys


def emit(payload):
    sys.stdout.write(json.dumps(payload, default=str))
    sys.stdout.flush()


def read_tabular(path, fmt):
    import pandas as pd

    # Read without assuming the first row is the header: bank exports often start with title rows.
    if fmt == "CSV":
        raw = pd.read_csv(path, dtype=str, keep_default_na=False, header=None, skip_blank_lines=False, encoding_errors="replace", on_bad_lines="skip", engine="python")
    else:
        raw = pd.read_excel(path, dtype=str, keep_default_na=False, header=None)
    raw = raw.fillna("")
    header_idx = 0
    for i in range(min(len(raw), 30)):
        if sum(1 for v in raw.iloc[i] if str(v).strip()) >= 3:
            header_idx = i
            break
    headers = [str(h).strip() for h in raw.iloc[header_idx]]
    body = raw.iloc[header_idx + 1 :]
    rows = []
    for _, r in body.iterrows():
        values = [str(v).strip() for v in r]
        if not any(values):
            continue
        rows.append({headers[i] or f"col{i}": values[i] for i in range(len(headers))})
    return {"headers": [h for h in headers if h], "rows": rows, "warnings": [], "text": None}


def read_pdf(path):
    import pdfplumber

    rows, headers, text_parts, warnings = [], None, [], []
    with pdfplumber.open(path) as pdf:
        for page in pdf.pages:
            text_parts.append(page.extract_text() or "")
            for table in page.extract_tables() or []:
                if not table:
                    continue
                if headers is None:
                    headers = [str(h or "").strip() for h in table[0]]
                    body = table[1:]
                else:
                    body = table[1:] if [str(h or "").strip() for h in table[0]] == headers else table
                for r in body:
                    if r and any((c or "").strip() for c in r):
                        rows.append({headers[i] if i < len(headers) else f"col{i}": (c or "").strip() for i, c in enumerate(r)})
    text = "\n".join(text_parts)
    if not text.strip():
        warnings.append("No text layer found: the PDF appears to be scanned and needs OCR.")
    return {"headers": headers or [], "rows": rows, "warnings": warnings, "text": text}


def main():
    if len(sys.argv) != 3:
        emit({"error": "usage: statement_parser.py <path> <format>"})
        sys.exit(2)
    path, fmt = sys.argv[1], sys.argv[2].upper()
    try:
        if fmt in ("CSV", "XLSX"):
            emit(read_tabular(path, fmt))
        else:
            emit(read_pdf(path))
    except Exception as exc:  # report, never crash silently
        emit({"error": f"{type(exc).__name__}: {exc}"})
        sys.exit(1)


if __name__ == "__main__":
    main()
