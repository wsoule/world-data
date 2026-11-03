// World Bank World Development Indicators for countries: decades of economy, health and
// development series from one consistent source, plus each country's price level relative to the
// US (from the PPP price level ratio), which lets the app compare dollar incomes at equal buying
// power across countries the way BEA price parities do for states.
//
// One keyless API request per indicator, cached as JSON. Responses include regional aggregates
// ("Arab World", "High income"); build-data drops rows for ids that are not countries we list.

import { access, mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { RPP, WORLD_BANK } from '../../src/data/external';
import type { Polarity } from '../../src/data/types';
import type { ExternalColumn, ExternalPage } from '../lib/external';

const API = 'https://api.worldbank.org/v2/country/all/indicator';
const FIRST_YEAR = 2000;

interface Indicator {
  code: string;
  id: number;
  key: string;
  header: string;
  format: string;
  pol: Polarity;
  topic: 'economy' | 'health' | 'development';
}

const INDICATORS: Indicator[] = [
  {
    code: 'NY.GDP.PCAP.CD',
    id: WORLD_BANK.gdpPerCapita,
    key: 'wbGdpPerCapita',
    header: 'GDP per Person (US$)',
    format: 'moneyWithCurrency',
    pol: 1,
    topic: 'economy',
  },
  {
    code: 'NY.GDP.PCAP.PP.CD',
    id: WORLD_BANK.gdpPerCapitaPpp,
    key: 'wbGdpPerCapitaPpp',
    header: 'GDP per Person at PPP (International $)',
    format: 'moneyWithCurrency',
    pol: 1,
    topic: 'economy',
  },
  {
    code: 'NY.GDP.MKTP.KD.ZG',
    id: WORLD_BANK.gdpGrowth,
    key: 'wbGdpGrowth',
    header: 'GDP Growth (%)',
    format: 'percAlt',
    pol: 1,
    topic: 'economy',
  },
  // Neither end of inflation is simply better: deflation is a problem too.
  {
    code: 'FP.CPI.TOTL.ZG',
    id: WORLD_BANK.inflation,
    key: 'wbInflation',
    header: 'Inflation, Consumer Prices (%)',
    format: 'percAlt',
    pol: 0,
    topic: 'economy',
  },
  {
    code: 'SL.UEM.TOTL.ZS',
    id: WORLD_BANK.unemployment,
    key: 'wbUnemployment',
    header: 'Unemployment Rate (%)',
    format: 'percAlt',
    pol: -1,
    topic: 'economy',
  },
  {
    code: 'SI.POV.GINI',
    id: WORLD_BANK.gini,
    key: 'wbGini',
    header: 'Income Inequality (Gini Index)',
    format: 'floatNumberTenths',
    pol: -1,
    topic: 'economy',
  },
  {
    code: 'SI.POV.DDAY',
    id: WORLD_BANK.extremePoverty,
    key: 'wbExtremePoverty',
    header: 'Extreme Poverty Rate (%)',
    format: 'percAlt',
    pol: -1,
    topic: 'economy',
  },
  {
    code: 'SP.DYN.LE00.IN',
    id: WORLD_BANK.lifeExpectancy,
    key: 'wbLifeExpectancy',
    header: 'Life Expectancy at Birth (Years)',
    format: 'floatNumberTenths',
    pol: 1,
    topic: 'health',
  },
  {
    code: 'SP.DYN.IMRT.IN',
    id: WORLD_BANK.infantMortality,
    key: 'wbInfantMortality',
    header: 'Infant Deaths per 1,000 Births',
    format: 'floatNumberTenths',
    pol: -1,
    topic: 'health',
  },
  {
    code: 'SH.XPD.CHEX.PC.CD',
    id: WORLD_BANK.healthSpending,
    key: 'wbHealthSpending',
    header: 'Health Spending per Person (US$)',
    format: 'moneyWithCurrency',
    pol: 0,
    topic: 'health',
  },
  {
    code: 'SP.DYN.TFRT.IN',
    id: WORLD_BANK.fertility,
    key: 'wbFertility',
    header: 'Births per Woman',
    format: 'floatNumber',
    pol: 0,
    topic: 'health',
  },
  {
    code: 'SE.ADT.LITR.ZS',
    id: WORLD_BANK.literacy,
    key: 'wbLiteracy',
    header: 'Adult Literacy Rate (%)',
    format: 'percAlt',
    pol: 1,
    topic: 'development',
  },
  {
    code: 'IT.NET.USER.ZS',
    id: WORLD_BANK.internetUsers,
    key: 'wbInternetUsers',
    header: 'Internet Users (% of People)',
    format: 'percAlt',
    pol: 1,
    topic: 'development',
  },
  {
    code: 'EG.ELC.ACCS.ZS',
    id: WORLD_BANK.electricityAccess,
    key: 'wbElectricityAccess',
    header: 'Access to Electricity (% of People)',
    format: 'percAlt',
    pol: 1,
    topic: 'development',
  },
  {
    code: 'SP.URB.TOTL.IN.ZS',
    id: WORLD_BANK.urbanPopulation,
    key: 'wbUrbanPopulation',
    header: 'Urban Population (%)',
    format: 'percAlt',
    pol: 0,
    topic: 'development',
  },
  {
    code: 'EN.GHG.CO2.PC.CE.AR5',
    id: WORLD_BANK.co2PerCapita,
    key: 'wbCo2PerCapita',
    header: 'CO2 Emissions per Person (Tonnes)',
    format: 'floatNumber',
    pol: -1,
    topic: 'development',
  },
];

const SOURCE = {
  url: 'https://databank.worldbank.org/source/world-development-indicators',
  name: 'World Development Indicators - The World Bank',
};

const TOPICS: Record<
  Indicator['topic'],
  Pick<ExternalPage, 'slug' | 'title' | 'cats'>
> = {
  economy: {
    slug: 'economic-indicators-by-country',
    title: 'Economic Indicators by Country (World Bank)',
    cats: ['economics'],
  },
  health: {
    slug: 'health-indicators-by-country',
    title: 'Health Indicators by Country (World Bank)',
    cats: ['health'],
  },
  development: {
    slug: 'development-indicators-by-country',
    title: 'Development Indicators by Country (World Bank)',
    cats: ['infrastructure-energy', 'environment'],
  },
};

/** Rows, columns and metric keys gathered for one topic. */
interface TopicData {
  rows: Map<string, Record<string, unknown>>;
  columns: Map<string, ExternalColumn>;
  keys: string[];
}

const cacheFile = (dir: string, code: string) => path.join(dir, `${code}.json`);

interface ApiRow {
  countryiso3code?: string;
  country?: { value?: string };
  date?: string;
  value?: number | null;
}

/** Downloads every indicator not yet cached in `dir` (all of them when `refresh`). */
export async function fetchWorldBank(
  dir: string,
  refresh: boolean
): Promise<void> {
  await mkdir(dir, { recursive: true });
  const year = new Date().getUTCFullYear();
  for (const ind of INDICATORS) {
    const f = cacheFile(dir, ind.code);
    if (!refresh) {
      try {
        await access(f);
        continue;
      } catch {
        // not cached yet
      }
    }
    const url = `${API}/${ind.code}?format=json&per_page=20000&date=${FIRST_YEAR}:${year}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`World Bank ${ind.code}: HTTP ${res.status}`);
    const body = (await res.json()) as unknown;
    // Errors come back as [{ message: [...] }] with no data array.
    if (!Array.isArray(body) || !Array.isArray(body[1])) {
      console.warn(
        `World Bank ${ind.code}: no data (${JSON.stringify(body).slice(0, 160)})`
      );
      continue;
    }
    await writeFile(`${f}.tmp`, JSON.stringify(body[1]));
    await rename(`${f}.tmp`, f);
    console.log(`cached World Bank ${ind.code}`);
  }
}

/**
 * Each country's price level relative to the US (US = 100), per year: GDP per person in US
 * dollars over GDP per person at purchasing power parity, ×100. The World Bank archived its
 * ready-made ratio (PA.NUS.PPPC.RF); this is the same ratio from two live indicators. It uses
 * the RPP id, so the app's cost-of-living adjustment works for countries as for states.
 */
function addPriceLevel(t: TopicData | undefined): void {
  if (t == null) return;
  const key = 'wbPriceLevel';
  for (const row of t.rows.values()) {
    for (const [field, usd] of Object.entries(row)) {
      const m = /^wbGdpPerCapita_(\d{4})$/.exec(field);
      if (m == null || typeof usd !== 'number') continue;
      const ppp = row[`wbGdpPerCapitaPpp_${m[1]}`];
      if (typeof ppp !== 'number' || ppp <= 0) continue;
      const out = `${key}_${m[1]}`;
      row[out] = (usd / ppp) * 100;
      t.columns.set(out, {
        id: RPP.allItems,
        field: out,
        dbField: key,
        year: Number(m[1]),
        header: 'Price Level (US = 100)',
        format: 'floatNumberTenths',
        unit: null,
        pol: -1,
      });
    }
  }
  if (!t.keys.includes(key)) t.keys.push(key);
}

/** World Bank topics as external pages; indicators that were not fetched are skipped. */
export async function worldBankPages(dir: string): Promise<ExternalPage[]> {
  const byTopic = new Map<Indicator['topic'], TopicData>();
  for (const ind of INDICATORS) {
    let data: ApiRow[];
    try {
      data = JSON.parse(
        await readFile(cacheFile(dir, ind.code), 'utf8')
      ) as ApiRow[];
    } catch {
      continue;
    }
    const t: TopicData = byTopic.get(ind.topic) ?? {
      rows: new Map(),
      columns: new Map(),
      keys: [],
    };
    byTopic.set(ind.topic, t);
    t.keys.push(ind.key);
    for (const r of data) {
      const iso3 = r.countryiso3code ?? '';
      const year = Number(r.date);
      if (
        !/^[A-Z]{3}$/.test(iso3) ||
        typeof r.value !== 'number' ||
        !Number.isFinite(year)
      )
        continue;
      const row = t.rows.get(iso3) ?? {
        cca3: iso3,
        country: r.country?.value ?? iso3,
      };
      t.rows.set(iso3, row);
      const field = `${ind.key}_${year}`;
      row[field] = r.value;
      t.columns.set(field, {
        id: ind.id,
        field,
        dbField: ind.key,
        year,
        header: ind.header,
        format: ind.format,
        unit: null,
        pol: ind.pol,
      });
    }
  }
  addPriceLevel(byTopic.get('economy'));
  return [...byTopic].map(([topic, t]) => ({
    ...TOPICS[topic],
    type: 'country' as const,
    sources: [SOURCE],
    updated: null,
    rows: [...t.rows.values()],
    columns: [...t.columns.values()],
    tables: [{ name: '', columns: t.keys }],
  }));
}
