import type { Metric } from '~/data/types';

const nf = (opts: Intl.NumberFormatOptions) =>
  new Intl.NumberFormat('en-US', opts);
const int = nf({ maximumFractionDigits: 0 });
const dec1 = nf({ minimumFractionDigits: 1, maximumFractionDigits: 1 });
const dec2 = nf({ maximumFractionDigits: 2 });
const dec3 = nf({ maximumFractionDigits: 3 });
const compact = nf({ notation: 'compact', maximumFractionDigits: 1 });
const compact2 = nf({ notation: 'compact', maximumFractionDigits: 2 });
const usd = nf({
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
});
const usdCents = nf({
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const usd3 = nf({
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 3,
  maximumFractionDigits: 3,
});
const eur = nf({
  style: 'currency',
  currency: 'EUR',
  maximumFractionDigits: 2,
});

export function ordinal(n: number): string {
  const r = Math.round(n);
  const mod100 = Math.abs(r) % 100;
  const mod10 = Math.abs(r) % 10;
  const suffix =
    mod100 >= 11 && mod100 <= 13
      ? 'th'
      : mod10 === 1
        ? 'st'
        : mod10 === 2
          ? 'nd'
          : mod10 === 3
            ? 'rd'
            : 'th';
  return `${int.format(r)}${suffix}`;
}

function smartNumber(v: number): string {
  const a = Math.abs(v);
  if (a >= 1e6) return compact2.format(v);
  if (a >= 1000 || Number.isInteger(v)) return int.format(v);
  if (a >= 100) return dec1.format(v);
  if (a >= 1) return dec2.format(v);
  if (a === 0) return '0';
  return nf({ maximumSignificantDigits: 3 }).format(v);
}

function money(v: number): string {
  const a = Math.abs(v);
  if (a >= 1e9) return '$' + compact2.format(v);
  if (a >= 100) return usd.format(v);
  return usdCents.format(v);
}

/** Puts the minus sign before the currency symbol ("-$93B", not "$-93B"). */
function signedMoney(v: number, format: (abs: number) => string): string {
  return v < 0 ? `-${format(-v)}` : format(v);
}

/** Units that state a scale ("in millions", "kt"): numbers in them are never abbreviated again. */
const SCALE_UNIT = /^(thousands?|millions?|billions?|mn|bn|kt|mt)$/i;

/** Units that repeat what the format already prints (°C for degC, $ for money, % for percents). */
function duplicatesFormat(unit: string, fmt: string | null): boolean {
  const u = unit.trim();
  if (fmt === 'degC') return /^°?\s*C$/i.test(u);
  if (fmt === 'degF') return /^°?\s*F$/i.test(u);
  if (fmt?.startsWith('money') === true) return /^(\$|usd|us\$)$/i.test(u);
  return false;
}

/**
 * Appends a metric's unit to a formatted number. Ranks, percentages, feet and
 * scale ranges such as "0-10" get no unit; "$ per gallon" becomes a currency
 * prefix plus " per gallon"; "%" attaches without a space.
 */
function withUnit(
  out: string,
  unit: string | null | undefined,
  fmt: string | null
): string {
  if (unit == null) return out;
  const u = unit.trim();
  if (u === '' || duplicatesFormat(u, fmt)) return out;
  if (
    fmt === 'ranking' ||
    fmt === 'perc' ||
    fmt === 'percAlt' ||
    fmt === 'cmToFeet'
  )
    return out;
  if (/^\d+(\.\d+)?\s*[-–]\s*\d+/.test(u)) return out;
  if (u === '%') return `${out}%`;
  if (u.startsWith('$') && fmt?.startsWith('money') !== true) {
    const rest = u.slice(1).trim();
    return `$${out}${rest === '' ? '' : ` ${rest}`}`;
  }
  return `${out} ${u}`;
}

/** Format a metric value the way the source presents it (with a few readability improvements). */
export function formatValue(
  metric: Pick<Metric, 'fmt' | 'unit' | 'kind'> | undefined,
  v: number | string | null | undefined,
  opts: { compact?: boolean; unit?: boolean } = {}
): string {
  if (v == null || (typeof v === 'number' && Number.isNaN(v))) return '—';
  if (typeof v === 'string')
    return v.replaceAll(' | ', ', ').replace(/\s*\|\s*$/, '');
  const fmt = metric?.fmt ?? null;
  const scaled = metric?.unit != null && SCALE_UNIT.test(metric.unit.trim());
  const compactOk = opts.compact === true && !scaled;
  let out: string;
  switch (fmt) {
    case 'ranking':
      // Some "rank" columns hold scores (52.2); only whole numbers are ordinals.
      out = Number.isInteger(v) ? ordinal(v) : dec1.format(v);
      break;
    case 'percAlt':
      out = `${Math.abs(v) < 10 ? dec2.format(v) : dec1.format(v)}%`;
      break;
    case 'perc':
      out = `${Math.abs(v) < 0.1 ? dec2.format(v * 100) : dec1.format(v * 100)}%`;
      break;
    case 'moneyWithCurrency':
    case 'moneyWithCurrencyAbbrev':
      out = signedMoney(v, (a) =>
        !scaled && (opts.compact === true || a >= 1e6)
          ? '$' + compact2.format(a)
          : money(a)
      );
      break;
    case 'moneyWithCurrencyDollars':
      out = signedMoney(v, (a) =>
        compactOk && a >= 1e5 ? '$' + compact.format(a) : usd.format(a)
      );
      break;
    case 'moneyWithCurrencyCents':
      out = signedMoney(v, (a) => usdCents.format(a));
      break;
    case 'moneyWithCurrency3':
      out = signedMoney(v, (a) => usd3.format(a));
      break;
    case 'moneyWithCurrencyEuros':
      out = signedMoney(v, (a) => eur.format(a));
      break;
    case 'abbreviateNumber':
    case 'abbreviateNumber1k':
    case 'floatNumberSmart':
      out =
        !scaled && Math.abs(v) >= 1e4
          ? compact.format(v)
          : scaled && Math.abs(v) >= 1e4
            ? int.format(v)
            : smartNumber(v);
      break;
    case 'numberWithCommas':
    case 'numberWithCommasRound':
    case 'numberWithCommasZeroes':
    case 'km2MiRound':
      out =
        compactOk && Math.abs(v) >= 1e5
          ? compact.format(v)
          : Number.isInteger(v) || Math.abs(v) >= 100
            ? int.format(v)
            : dec2.format(v);
      break;
    case 'floatNumberTenths':
      out =
        compactOk && Math.abs(v) >= 1e5 ? compact.format(v) : dec1.format(v);
      break;
    case 'floatNumber':
      out =
        compactOk && Math.abs(v) >= 1e5 ? compact.format(v) : dec2.format(v);
      break;
    case 'floatNumber3':
      out = dec3.format(v);
      break;
    case 'degC':
      out = `${dec1.format(v)}°C`;
      break;
    case 'degF':
      out = `${dec1.format(v)}°F`;
      break;
    case 'year':
      out = v < 0 ? `${Math.round(-v)} BC` : String(Math.round(v));
      break;
    case 'zipCode':
      out = String(Math.round(v));
      break;
    case 'cmToFeet': {
      const inches = Math.round(v / 2.54);
      out = `${Math.floor(inches / 12)}′ ${inches % 12}″`;
      break;
    }
    case 'plusMinus':
      out = (v > 0 ? '+' : '') + dec2.format(v);
      break;
    case 'pvir':
      out =
        v === 0 ? 'EVEN' : v > 0 ? `R+${int.format(v)}` : `D+${int.format(-v)}`;
      break;
    default:
      out =
        compactOk && Math.abs(v) >= 1e5 ? compact.format(v) : smartNumber(v);
  }
  return opts.unit === false ? out : withUnit(out, metric?.unit, fmt);
}

/** Short axis tick formatter for a metric. */
export function tickFormatter(
  metric: Pick<Metric, 'fmt' | 'unit' | 'kind'> | undefined
) {
  return (v: number) => formatValue(metric, v, { compact: true, unit: false });
}

export const formatInt = (v: number) => int.format(v);
export const formatCompact = (v: number) => compact.format(v);
export const formatPercent = (v: number, digits = 0) =>
  `${(v * 100).toFixed(digits)}%`;

export function formatSigned(v: number, digits = 2): string {
  return (v > 0 ? '+' : v < 0 ? '−' : '') + Math.abs(v).toFixed(digits);
}

/**
 * Lower-cases a type name for use mid-sentence while keeping acronyms, so
 * "US City" becomes "US city" and "Country" becomes "country".
 */
export function typeNoun(name: string): string {
  return name
    .split(' ')
    .map((w) => (/^[A-Z]{2,}$/.test(w) ? w : w.toLowerCase()))
    .join(' ');
}

export function plural(n: number, one: string, many = `${one}s`) {
  return `${int.format(n)} ${n === 1 ? one : many}`;
}
