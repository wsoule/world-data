import type { PlaceView } from './pageData';
import { sourceNote } from './profileModel';
import {
  ACS,
  BLS,
  CDC_PLACES,
  ELECTIONS,
  FBI_CRIME,
  NOAA_CLIMATE,
  RPP,
  WORLD_BANK,
} from '~/data/external';
import type { EntityType } from '~/data/types';
import { formatInt, formatValue, ordinal } from '~/lib/format';

/** One tile: a friendly label, the value, a line of context (rank or detail) and its source. */
interface Glance {
  label: string;
  value: string;
  rank: string;
  /** Who published the figure and for when ("World Bank 2024"; see `sourceNote`) */
  source: string | null;
}

/** The key statistics shown for every place of a type, in reading order. */
const GLANCE: Record<EntityType, { id: number; label: string }[]> = {
  state: [
    { id: ACS.medianHouseholdIncome, label: 'Median household income' },
    { id: BLS.meanWage, label: 'Average wage' },
    { id: RPP.allItems, label: 'Cost of living' },
    { id: ACS.medianHomeValue, label: 'Median home value' },
    { id: ACS.medianRent, label: 'Median rent' },
    { id: BLS.unemployment, label: 'Unemployment' },
    { id: ACS.povertyRate, label: 'Poverty rate' },
    { id: ACS.bachelorsShare, label: 'College degree' },
    { id: FBI_CRIME.violent, label: 'Violent crime per 100K' },
    { id: ACS.commuteMinutes, label: 'Average commute' },
    { id: NOAA_CLIMATE.annualTemp, label: 'Climate' },
    { id: ELECTIONS.margin, label: '2024 presidential vote' },
  ],
  county: [
    { id: ACS.medianHouseholdIncome, label: 'Median household income' },
    { id: ACS.medianHomeValue, label: 'Median home value' },
    { id: ACS.medianRent, label: 'Median rent' },
    { id: BLS.unemployment, label: 'Unemployment' },
    { id: ACS.povertyRate, label: 'Poverty rate' },
    { id: ACS.bachelorsShare, label: 'College degree' },
    { id: CDC_PLACES.obesity, label: 'Adult obesity' },
    { id: CDC_PLACES.uninsured, label: 'No health insurance' },
    { id: ACS.commuteMinutes, label: 'Average commute' },
    { id: ACS.broadbandShare, label: 'Home broadband' },
    { id: NOAA_CLIMATE.annualTemp, label: 'Climate' },
    { id: ELECTIONS.margin, label: '2024 presidential vote' },
  ],
  city: [
    { id: ACS.medianHouseholdIncome, label: 'Median household income' },
    { id: BLS.meanWage, label: 'Average wage (metro)' },
    { id: RPP.allItems, label: 'Cost of living (metro)' },
    { id: ACS.medianHomeValue, label: 'Median home value' },
    { id: ACS.medianRent, label: 'Median rent' },
    { id: ACS.povertyRate, label: 'Poverty rate' },
    { id: ACS.bachelorsShare, label: 'College degree' },
    { id: FBI_CRIME.violent, label: 'Violent crime per 100K' },
    { id: ACS.commuteMinutes, label: 'Average commute' },
    { id: ACS.broadbandShare, label: 'Home broadband' },
  ],
  country: [
    { id: WORLD_BANK.gdpPerCapitaPpp, label: 'GDP per person (PPP)' },
    { id: RPP.allItems, label: 'Price level' },
    { id: WORLD_BANK.unemployment, label: 'Unemployment' },
    { id: WORLD_BANK.inflation, label: 'Inflation' },
    { id: WORLD_BANK.lifeExpectancy, label: 'Life expectancy' },
    { id: WORLD_BANK.infantMortality, label: 'Infant deaths per 1,000' },
    { id: WORLD_BANK.fertility, label: 'Births per woman' },
    { id: WORLD_BANK.internetUsers, label: 'Internet users' },
    { id: WORLD_BANK.urbanPopulation, label: 'Lives in cities' },
    { id: WORLD_BANK.co2PerCapita, label: 'CO2 per person (tonnes)' },
  ],
  'world-city': [],
};

/** "Highest of 51", "12th highest of 51", "Lowest of 51": a plain position, no judgement. */
function position(rank: number, n: number): string {
  if (rank === 1) return `Highest of ${formatInt(n)}`;
  if (rank === n) return `Lowest of ${formatInt(n)}`;
  return `${ordinal(rank)} highest of ${formatInt(n)}`;
}

/** The tiles for one place: values with their position, and friendlier wording for a few. */
export function glanceStats(
  view: Pick<PlaceView, 'dataset' | 'value' | 'highest'>
): Glance[] {
  const out: Glance[] = [];
  const at = (id: number) => {
    const v = view.value(id);
    return Number.isFinite(v) ? v : null;
  };
  for (const { id, label } of GLANCE[view.dataset.type.id]) {
    const metric = view.dataset.metric(id);
    const s = metric == null ? null : view.highest(id);
    if (metric == null || s == null) continue;
    let value = formatValue(metric, s.value);
    let rank = position(s.rank, s.n);
    if (id === RPP.allItems) {
      const diff = Math.round(s.value - 100);
      value =
        diff === 0
          ? 'US average'
          : `${Math.abs(diff)}% ${diff > 0 ? 'above' : 'below'} US`;
    } else if (id === NOAA_CLIMATE.annualTemp) {
      value = `${s.value.toFixed(1)}°F average`;
      const jan = at(NOAA_CLIMATE.januaryTemp);
      const jul = at(NOAA_CLIMATE.julyTemp);
      if (jan != null && jul != null)
        rank = `${jan.toFixed(0)}°F in January, ${jul.toFixed(0)}°F in July`;
    } else if (id === ELECTIONS.margin) {
      const rep = at(ELECTIONS.republicanShare);
      const dem = at(ELECTIONS.democraticShare);
      value = `${s.value > 0 ? 'Republican' : 'Democratic'} +${Math.abs(s.value).toFixed(1)}`;
      if (rep != null && dem != null)
        rank = `${rep.toFixed(1)}% Republican, ${dem.toFixed(1)}% Democratic`;
    } else if (id === ACS.commuteMinutes) {
      value = `${s.value.toFixed(0)} minutes`;
    }
    out.push({
      label,
      value,
      rank,
      source: sourceNote(metric, view.dataset.type.id),
    });
  }
  return out;
}

/**
 * "At a glance": the same key statistics for every place of a type (income, prices, housing,
 * work, education, safety, climate, the vote), so any two places read the same way. Positions
 * are stated plainly ("12th highest of 51") because a high home value or a warm climate is
 * neither good nor bad, and each tile names its source and year ("World Bank 2024").
 */
export function AtAGlance({ view }: { view: PlaceView }) {
  const stats = glanceStats(view);
  if (stats.length === 0) return null;
  return (
    <section aria-labelledby="glance-heading" className="space-y-3">
      <h2 id="glance-heading" className="text-lg font-semibold">
        At a glance
      </h2>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
        {stats.map((s) => (
          <GlanceTile key={s.label} {...s} />
        ))}
      </div>
    </section>
  );
}

/** One "At a glance" tile: label, value, position and the figure's source and year. */
function GlanceTile({ label, value, rank, source }: Glance) {
  return (
    <div className="border-app bg-surface min-w-0 rounded-xl border px-3 py-2">
      <div className="text-muted truncate text-xs">{label}</div>
      <div className="tabular truncate text-base font-semibold">{value}</div>
      <div className="text-muted truncate text-[11px]">{rank}</div>
      {source != null ? (
        <div className="text-muted truncate text-[11px] opacity-80">
          {source}
        </div>
      ) : null}
    </div>
  );
}
