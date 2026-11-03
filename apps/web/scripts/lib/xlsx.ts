// A minimal .xlsx reader for the government spreadsheets the external sources use (FBI crime
// tables, BLS county unemployment and wages). An .xlsx file is a zip of XML; this reads the
// shared strings and one worksheet with the system unzip and returns the cells as a grid.
// It handles shared, inline and formula-string cells and numbers, which is all these files use.

import { execFileSync } from 'node:child_process';

export type Cell = string | number | null;

const unzipText = (file: string, member: string): string =>
  execFileSync('unzip', ['-p', file, member], {
    encoding: 'utf8',
    maxBuffer: 512 * 1024 * 1024,
  });

const decode = (s: string): string =>
  s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, d: string) => String.fromCodePoint(Number(d)))
    .replace(/&amp;/g, '&');

/** Text of every <t> run inside an XML fragment (rich text splits a string into runs). */
const runs = (xml: string): string =>
  decode(
    [...xml.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((m) => m[1]).join('')
  );

/** "B" → 1, "AA" → 26: the zero-based column of a cell reference's letters. */
function columnIndex(ref: string): number {
  let n = 0;
  for (const ch of ref) {
    if (ch < 'A' || ch > 'Z') break;
    n = n * 26 + (ch.charCodeAt(0) - 64);
  }
  return n - 1;
}

/** Worksheet members in workbook order (xl/worksheets/sheet1.xml, …). */
export function sheetNames(file: string): string[] {
  return execFileSync('unzip', ['-Z1', file], { encoding: 'utf8' })
    .split('\n')
    .filter((n) => /^xl\/worksheets\/sheet\d+\.xml$/.test(n))
    .sort(
      (a, b) =>
        Number(/(\d+)\.xml$/.exec(a)?.[1]) - Number(/(\d+)\.xml$/.exec(b)?.[1])
    );
}

/** Cells of one worksheet (the first by default) as rows of columns; gaps are null. */
export function readSheet(file: string, sheet?: string): Cell[][] {
  const member = sheet ?? sheetNames(file)[0];
  if (member == null) throw new Error(`${file}: no worksheets`);
  let shared: string[] = [];
  try {
    shared = [
      ...unzipText(file, 'xl/sharedStrings.xml').matchAll(
        /<si>([\s\S]*?)<\/si>/g
      ),
    ].map((m) => runs(m[1]));
  } catch {
    // a workbook without shared strings
  }
  const xml = unzipText(file, member);
  const rows: Cell[][] = [];
  for (const r of xml.matchAll(
    /<row\b[^>]*?(?:r="(\d+)")?[^>]*>([\s\S]*?)<\/row>/g
  )) {
    const index = r[1] != null ? Number(r[1]) - 1 : rows.length;
    const row: Cell[] = [];
    for (const c of r[2].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const attrs = c[1];
      const body = c[2] ?? '';
      const ref = /\br="([A-Z]+)\d+"/.exec(attrs)?.[1];
      const type = /\bt="(\w+)"/.exec(attrs)?.[1];
      const v = /<v>([\s\S]*?)<\/v>/.exec(body)?.[1];
      let value: Cell = null;
      if (type === 's' && v != null) value = shared[Number(v)] ?? null;
      else if (type === 'inlineStr') value = runs(body);
      else if (type === 'str' || type === 'e')
        value = v == null ? null : decode(v);
      else if (v != null) {
        const n = Number(v);
        value = Number.isFinite(n) ? n : decode(v);
      }
      const col = ref != null ? columnIndex(ref) : row.length;
      row[col] = value;
    }
    rows[index] = Array.from(row, (x) => x ?? null);
  }
  return Array.from(rows, (x) => x ?? []);
}
