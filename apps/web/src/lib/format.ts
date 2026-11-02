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
  if (a >= 1000) return int.format(v);
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
  let out: string;
  switch (fmt) {
    case 'ranking':
      out = ordinal(v);
      break;
    case 'percAlt':
      out = `${Math.abs(v) < 10 ? dec2.format(v) : dec1.format(v)}%`;
      break;
    case 'perc':
      out = `${Math.abs(v) < 0.1 ? dec2.format(v * 100) : dec1.format(v * 100)}%`;
      break;
    case 'moneyWithCurrency':
    case 'moneyWithCurrencyAbbrev':
      out =
        opts.compact === true || Math.abs(v) >= 1e6
          ? '$' + compact2.format(v)
          : money(v);
      break;
    case 'moneyWithCurrencyDollars':
      out =
        opts.compact === true && Math.abs(v) >= 1e5
          ? '$' + compact.format(v)
          : usd.format(v);
      break;
    case 'moneyWithCurrencyCents':
      out = usdCents.format(v);
      break;
    case 'moneyWithCurrency3':
      out = usd3.format(v);
      break;
    case 'moneyWithCurrencyEuros':
      out = eur.format(v);
      break;
    case 'abbreviateNumber':
    case 'abbreviateNumber1k':
    case 'floatNumberSmart':
      out = Math.abs(v) >= 1e4 ? compact.format(v) : smartNumber(v);
      break;
    case 'numberWithCommas':
    case 'numberWithCommasRound':
    case 'numberWithCommasZeroes':
    case 'km2MiRound':
      out =
        opts.compact === true && Math.abs(v) >= 1e5
          ? compact.format(v)
          : Number.isInteger(v) || Math.abs(v) >= 100
            ? int.format(v)
            : dec2.format(v);
      break;
    case 'floatNumberTenths':
      out =
        opts.compact === true && Math.abs(v) >= 1e5
          ? compact.format(v)
          : dec1.format(v);
      break;
    case 'floatNumber':
      out =
        opts.compact === true && Math.abs(v) >= 1e5
          ? compact.format(v)
          : dec2.format(v);
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
    case 'zipCode':
      out = String(Math.round(v));
      break;
    case 'cmToFeet': {
      const inches = v / 2.54;
      out = `${Math.floor(inches / 12)}′ ${Math.round(inches % 12)}″`;
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
        opts.compact === true && Math.abs(v) >= 1e5
          ? compact.format(v)
          : smartNumber(v);
  }
  if (
    opts.unit !== false &&
    metric?.unit &&
    !/[$%°]/.test(metric.unit) &&
    !/^\d+(\.\d+)?\s*[-–]\s*\d+/.test(metric.unit) &&
    fmt?.startsWith('money') !== true &&
    fmt !== 'cmToFeet'
  ) {
    out += ` ${metric.unit}`;
  }
  return out;
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
