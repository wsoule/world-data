// A small RFC 4180 CSV parser for the external sources: quoted fields, doubled quotes inside
// them, and line breaks inside quotes. Fields are returned as written (untrimmed).

/** Every row of `text` as an array of fields. A trailing empty line is dropped. */
export function parseCsv(text: string, delimiter = ','): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === delimiter) {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else field += ch;
  }
  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

/** Rows as objects keyed by the header row's (trimmed) names. */
export function csvRecords(
  text: string,
  delimiter = ','
): Record<string, string>[] {
  const [head, ...rows] = parseCsv(text, delimiter);
  if (head == null) return [];
  const keys = head.map((h) => h.trim());
  return rows.map((r) =>
    Object.fromEntries(keys.map((k, i) => [k, (r[i] ?? '').trim()]))
  );
}

/** A finite number from a field ("1,234.5", " 12 "), or null for blanks and codes like "(NA)". */
export function num(field: string | undefined): number | null {
  if (field == null) return null;
  const t = field.replace(/[,$%\s]/g, '');
  if (t === '' || !/^-?\d*\.?\d+(e-?\d+)?$/i.test(t)) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}
