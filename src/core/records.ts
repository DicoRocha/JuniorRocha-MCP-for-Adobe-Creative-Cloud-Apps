/**
 * Records for batch work (InDesign data merge, Photoshop variations): CSV/TSV/JSON → array of objects.
 * CSV: RFC 4180 quotes, BOM, delimiter auto-detected (; , tab), first row = headers.
 */
import * as fs from "node:fs";

export type RecordRow = Record<string, string>;

export function detectDelimiter(firstLine: string): string {
  const counts: Array<[string, number]> = [";", ",", "\t", "|"].map((d) => [d, firstLine.split(d).length - 1]);
  counts.sort((a, b) => b[1] - a[1]);
  return counts[0][1] > 0 ? counts[0][0] : ",";
}

export function parseCsv(text: string, delimiter?: string): RecordRow[] {
  const src = text.replace(/^﻿/, "");
  const firstLine = src.split(/\r?\n/, 1)[0] ?? "";
  const d = delimiter ?? detectDelimiter(firstLine);
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += c;
      continue;
    }
    if (c === '"' && field === "") quoted = true;
    else if (c === d) {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && src[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += c;
  }
  if (field !== "" || row.length) {
    row.push(field);
    rows.push(row);
  }
  const nonEmpty = rows.filter((r) => r.some((v) => v.trim() !== ""));
  if (!nonEmpty.length) return [];
  const headers = nonEmpty[0].map((h) => h.trim());
  return nonEmpty.slice(1).map((r) => {
    const o: RecordRow = {};
    headers.forEach((h, i) => {
      if (h) o[h] = (r[i] ?? "").trim();
    });
    return o;
  });
}

export function loadRecords(opts: { csvPath?: string; jsonPath?: string; records?: Array<Record<string, unknown>>; delimiter?: string }): RecordRow[] {
  let rows: Array<Record<string, unknown>>;
  if (opts.records) rows = opts.records;
  else if (opts.csvPath) rows = parseCsv(fs.readFileSync(opts.csvPath, "utf8"), opts.delimiter);
  else if (opts.jsonPath) {
    const data = JSON.parse(fs.readFileSync(opts.jsonPath, "utf8"));
    rows = Array.isArray(data) ? data : data.records;
  } else throw Object.assign(new Error("Give records, csvPath or jsonPath."), { code: "INVALID_PARAMS" });
  if (!Array.isArray(rows) || !rows.length) throw Object.assign(new Error("No records found."), { code: "INVALID_PARAMS" });
  return rows.map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, v === null || v === undefined ? "" : String(v)])));
}

/** "{{name}}-{{size}}" → "Anna-1080x1350", made safe for file names. */
export function fillPattern(pattern: string, row: RecordRow, index: number): string {
  const s = pattern.replace(/\{\{\s*([^}]+?)\s*\}\}/g, (_m, k: string) => (k === "#" ? String(index + 1).padStart(2, "0") : row[k] ?? ""));
  return s.replace(/[\\/:*?"<>|]+/g, "_").trim();
}
