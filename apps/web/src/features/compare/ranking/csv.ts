export type CsvCell = string | number | null | undefined;

/** Quote a CSV field when it contains a delimiter, quote or line break (RFC 4180). */
export function csvField(v: CsvCell): string {
  if (v == null) return '';
  if (typeof v === 'number') return Number.isFinite(v) ? String(v) : '';
  return /[",\r\n]/.test(v) ? `"${v.replaceAll('"', '""')}"` : v;
}

/** Serialise a header and rows as CSV with CRLF line endings. */
export function toCsv(
  header: readonly string[],
  rows: readonly (readonly CsvCell[])[]
): string {
  return [header, ...rows]
    .map((r) => r.map((c) => csvField(c)).join(','))
    .join('\r\n');
}

/** Trigger a client-side download of `text` as a UTF-8 CSV file. */
export function downloadCsv(filename: string, text: string): void {
  // Byte-order mark so spreadsheet apps detect UTF-8 (place names with accents).
  const bom = String.fromCharCode(0xfeff);
  const blob = new Blob([bom, text], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

/** Plain leaderboard rows for export (built from the ranking model by the view). */
export interface RankingExport {
  placeLabel: string;
  scoreLabel: string;
  /** Column headers for each metric's value and percentile */
  metricColumns: { value: string; percentile: string }[];
  rows: {
    rank: number;
    name: string;
    id: string;
    group: string | null;
    score: number;
    coverage: number;
    /** [value, percentile] per metric, NaN when missing */
    metrics: [number, number][];
  }[];
}

const round = (v: number, digits: number) =>
  Number.isFinite(v) ? Number(v.toFixed(digits)) : null;

/** Leaderboard as CSV: rank, place, id, group, score, coverage, then value + percentile per metric. */
export function rankingCsv(x: RankingExport): string {
  const header = [
    'Rank',
    x.placeLabel,
    'ID',
    'Group',
    x.scoreLabel,
    'Metrics with data',
    ...x.metricColumns.flatMap((c) => [c.value, c.percentile]),
  ];
  return toCsv(
    header,
    x.rows.map((r) => [
      r.rank,
      r.name,
      r.id,
      r.group,
      round(r.score, 3),
      r.coverage,
      ...r.metrics.flatMap(([v, p]) => [
        Number.isFinite(v) ? v : null,
        round(p, 1),
      ]),
    ])
  );
}
