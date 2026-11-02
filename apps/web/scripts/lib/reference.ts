// Static reference data used while building the dataset.

export const STATE_REGIONS: Record<string, string> = {
  CT: 'Northeast',
  ME: 'Northeast',
  MA: 'Northeast',
  NH: 'Northeast',
  RI: 'Northeast',
  VT: 'Northeast',
  NJ: 'Northeast',
  NY: 'Northeast',
  PA: 'Northeast',
  IL: 'Midwest',
  IN: 'Midwest',
  MI: 'Midwest',
  OH: 'Midwest',
  WI: 'Midwest',
  IA: 'Midwest',
  KS: 'Midwest',
  MN: 'Midwest',
  MO: 'Midwest',
  NE: 'Midwest',
  ND: 'Midwest',
  SD: 'Midwest',
  DE: 'South',
  FL: 'South',
  GA: 'South',
  MD: 'South',
  NC: 'South',
  SC: 'South',
  VA: 'South',
  DC: 'South',
  WV: 'South',
  AL: 'South',
  KY: 'South',
  MS: 'South',
  TN: 'South',
  AR: 'South',
  LA: 'South',
  OK: 'South',
  TX: 'South',
  AZ: 'West',
  CO: 'West',
  ID: 'West',
  MT: 'West',
  NV: 'West',
  NM: 'West',
  UT: 'West',
  WY: 'West',
  AK: 'West',
  CA: 'West',
  HI: 'West',
  OR: 'West',
  WA: 'West',
  PR: 'Territory',
  GU: 'Territory',
  VI: 'Territory',
  AS: 'Territory',
  MP: 'Territory',
};

export const CATEGORY_LABELS: Record<string, string> = {
  agriculture: 'Agriculture',
  'crime-safety': 'Crime & Safety',
  culture: 'Culture',
  economics: 'Economics',
  education: 'Education',
  environment: 'Environment',
  'facts-trivia': 'Facts & Trivia',
  flags: 'Flags',
  geography: 'Geography',
  health: 'Health',
  history: 'History',
  'infrastructure-energy': 'Infrastructure & Energy',
  law: 'Law',
  'manufacturing-mining': 'Manufacturing & Mining',
  military: 'Military',
  'politics-government': 'Politics & Government',
  population: 'Population',
  sports: 'Sports',
  'tech-business': 'Tech & Business',
  travel: 'Travel',
};

// Words that usually mean "lower is better" / "higher is better" for a quality-of-life reading.
// This only seeds the default direction in composite rankings; users can flip any metric.
const LOWER =
  /\b(crime|crimes|criminal|murder|homicide|violent|violence|theft|robbery|burglary|assault|rape|kidnap|terror|death|deaths|dead|died|mortality|fatal|fatality|fatalities|killed|suicide|overdose|poverty|poor|unemploy\w*|debt|deficit|inflation|pollution|polluted|emission|emissions|co2|carbon|smog|pm2\.?5|obes\w*|smok\w*|tobacco|alcoholism|drunk\w*|drug|opioid|disease|cancer|diabetes|hiv|aids|malaria|tuberculosis|infection|stress|depress\w*|anxiety|corruption|corrupt|inequality|gini|risk|danger\w*|dangerous|worst|unsafe|incarcerat\w*|prison|prisoners|inmates|eviction|homeless\w*|cost of living|rent burden|tax burden|commute|traffic|congestion|accident|accidents|crash|crashes|injur\w*|abuse|fraud|scam|hate|bankrupt\w*|foreclosure|uninsured|stillbirth|underweight|stunting|malnutrition|hunger|starvation|undernourish\w*|illiteracy|dropout|fragile|fragility|misery|secrecy)\b/i;
const HIGHER =
  /\b(gdp|income|wage|wages|salary|salaries|earnings|wealth|wealthiest|richest|happiness|happiest|happy|life expectancy|literacy|literate|education|educated|graduation|attainment|hdi|human development|freedom|free|democracy|peace|peaceful|safety|safest|safe|quality|best|innovation|competitiveness|prosperity|well-being|wellbeing|purchasing power|press freedom|internet speed|broadband|access|insured|vaccination|vaccinated|employment rate|labor force|productivity|patents|healthiest|cleanest|greenest|renewable|forest|biodiversity|tolerance|trust|satisfaction|longevity|iq|pisa|test scores)\b/i;

// Phrases that invert the meaning of the word they precede ("never smoked", "less than high school").
const NEGATOR =
  /\b(less than|without|lack of|lacking|no access|never|non[- ]?smok\w*)\b|-free\b/i;

// Columns with no better/worse reading regardless of the words above:
// calendar years, age and speed limits, thresholds, and what people prefer
// ("Favorite Season Is Summer", "Preferred Space between Strangers").
const NEUTRAL =
  /\b(min(imum)?|max(imum)?|legal|voting|drinking|driving)\s+age\b|\bage requirement\b|\bspeed limits?\b|^year\b|\byear (of|joined|admitted|founded|established|adopted|implemented|assessed|measured|granted)\b|\b(join|founding|independence) year\b|\bnumber of seasons\b|^poverty (wage|guidelines?|thresholds?)\b|\bfavou?rite\b|\bprefer(red|s)?\b|\bfor felony\b/i;

// Money or effort spent: less is better for the person paying it.
const COST =
  /\bcosts?\b|\bprices?\b|\bfees?\b|\bspent on (groceries|food|rent|housing|transport|utilities|child ?care)\b|\bexpensive\b|\bbelow basic\b|\b(livable|living) wage\b/i;
// Scores that fold cost into "how good is access", where higher is better.
const ACCESS = /\bafford|\bavailability\b/i;

// Taxes: rates, amounts and burdens that residents or firms pay are costs.
const TAX = /\btax(es)?\b|\btaxed\b|\bcapital gains\b/i;
// Labels with no subject of their own ("Min Rate", "Lowest Bracket"), which
// take it from the key ("TaxRatesMinRate2023"). A label with a subject keeps
// it even when the key names a tax page: "% Change In Pop. 2021-2022"
// [LeastTaxed_ChangeInPop2021to2022] is about population.
const GENERIC_LABEL =
  /^(?:(?:min(?:imum)?|max(?:imum)?|rates?|lowest|highest|top|bottom|brackets?|average|avg|median|total|amount|estimated|combined|state|local|effective|overall)\.?\s*)+$/i;
// Tax columns that are not a bill anyone pays: what governments collect
// ("Tax Revenue as % of GDP", "Income Tax Share"), where a schedule starts
// (brackets, thresholds, exemptions, credits, taxable wage bases), returns
// filed, tax havens and evasion.
const TAX_NEUTRAL =
  /\brevenue\b|\bto gdp\b|\bshare\b|\bratio\b|\bbrackets?\b|\bthresholds?\b|\bexempt(ion|ions)?\b|\bcredits?\b|\btaxable\b|\bsubject(ed)? to tax\b|\breturns?\b|\bhaven\b|\bevade[ds]?\b|\bevasion\b|\btax loss\b|\btax dollars\b|\bpaid by states?\b/i;
// Excise and carbon taxes are policy levers on what is taxed, so a higher
// one is neither better nor worse for a place.
const SIN_TAX =
  /\b(carbon|co2|cigarettes?|tobacco|alcohol|beer|wine|spirits|liquor|nicotine|sugar|soda|cannabis|marijuana)\b/i;

/**
 * Abbreviations the source uses in labels, spelled out so the word lists
 * still match them ("Agrv Assault Rate", "COVID Vacc.", "Total STD Rate").
 */
const ABBREVIATIONS: readonly [RegExp, string][] = [
  [/\b(agrv|aggr?)\.?(?=\s|$)/gi, 'aggravated'],
  [/\bvacc\.?(?=\s|$)/gi, 'vaccination'],
  [/\bgrad\.(?=\s|$)/gi, 'graduation'],
  [/\bstarv\.(?=\s|$)/gi, 'starvation'],
  [/\bunemp\.(?=\s|$)/gi, 'unemployment'],
  [/\bmort\.(?=\s|$)/gi, 'mortality'],
  [/\bviol\.(?=\s|$)/gi, 'violent'],
  [/\b(stds?|stis?)\b/gi, 'sexually transmitted disease'],
];

/** The label with the source's abbreviations spelled out. */
function expandAbbreviations(label: string): string {
  let out = label;
  for (const [re, word] of ABBREVIATIONS) out = out.replace(re, word);
  return out;
}

/**
 * The words of a metric key ("StatesWithAll4Seasons_FavoriteSeasonIsSpring_
 * pctOfResidents_YearFree" → "States With All4 Seasons Favorite …"), minus
 * source bookkeeping that reads like a quality word: "YearFree" marks an
 * undated column (not freedom) and "BestEstimate" is a statistic (not best).
 */
export function keyText(key: string): string {
  return key
    .replace(/YearFree|MultiYear|BestEstimate/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/_/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Polarity of a tax column, or null when it is not about a tax (the label
 * names none, and either has a subject of its own or the key names none).
 * Rates, amounts and burdens that residents pay are lower-is-better;
 * collections, schedule boundaries and excise taxes are neutral.
 */
function taxPolarity(label: string, key: string): -1 | 0 | null {
  const both = `${label} ${keyText(key)}`;
  const text = TAX.test(label)
    ? label
    : GENERIC_LABEL.test(label) && TAX.test(both)
      ? both
      : null;
  if (text == null) return null;
  if (TAX_NEUTRAL.test(text) || SIN_TAX.test(both)) return 0;
  return -1;
}

// A rank column counts from the worst place when its label, or the leading
// words of its key, name a worst-first list ("Worst City Ranking", "Most
// Hated Rank", "WorstStates_USNewsEconomy"). A listicle's title alone is not
// enough: "saddest-states" carries WalletHub's happiest-first sub-ranks.
const WORST_FIRST =
  /\b(worst|most (hated|stressed|racist|boring|dangerous|polluted)|least (desirable|livable)|ugliest|rudest|drunkest|poorest|deadliest|dirtiest|unhealthiest|homophobic|(water )?stress)\b/i;
// Labels naming the good end of a ranking, which beats a worst-first key:
// "Low Incarceration Rate Rank" [WorstPrisonsLowIncarcerationRate].
const BEST_FIRST =
  /\b(best|top|low|lowest|least|safest|healthiest|happiest|equality)\b/i;
// Worst-first ranks whose label and key do not say so, checked against the
// source order: FiveThirtyEight's corruption ranks put New York (total
// convictions), Louisiana (per capita), Kentucky (reporter survey) and
// Georgia (lack of laws) first.
const WORST_FIRST_KEYS = new Set([
  'FTECorruptionConvictionsTotal',
  'FTECorruptionConvictionsPerCapita',
  'FTEReporterRatings',
  'FTELackofLaws',
]);

/** Matches labels that name a rank position ("Fishing Rank", "Men's ODI Ranking"). */
export const RANK_LABEL = /\brank(ing)?\b/i;
/**
 * Rank labels that are not a position: a move between editions ("Change in
 * DI Rank", "Change in Rank 2025-26") or a percentile.
 */
export const NOT_A_POSITION =
  /\bchange (in|from|since)\b|\brank(ing)? change\b|\bpercentile\b/i;

/**
 * Direction of a rank column: -1 when rank 1 is the best place (the usual
 * reading), 1 when rank 1 is the worst (see WORST_FIRST). A percentile rank
 * is higher-is-better, and a change in rank has no agreed sign, so neutral.
 */
function rankPolarity(label: string, key: string): -1 | 0 | 1 {
  if (/\bpercentile\b/i.test(label)) return 1;
  if (NOT_A_POSITION.test(label)) return 0;
  if (WORST_FIRST.test(label)) return 1;
  if (!BEST_FIRST.test(label) && WORST_FIRST.test(keyText(key))) return 1;
  return WORST_FIRST_KEYS.has(key) ? 1 : -1;
}

// A share of GDP ("Infrastructure Spending (% of GDP)") is not GDP, so the
// phrase must not count as the higher-is-better word "gdp".
const SHARE_OF_GDP =
  /\b(?:as )?(?:a )?(?:%|pct|percent(?:age)?|share)? ?(?:of|to)(?: [a-z]+)? gdp\b/gi;

/** Polarity from the word lists alone, LOWER first; 0 when neither matches. */
function wordPolarity(text: string): -1 | 0 | 1 {
  const words = text.replace(SHARE_OF_GDP, ' ');
  if (LOWER.test(words)) return -1;
  return HIGHER.test(words) ? 1 : 0;
}

/**
 * Guesses whether a higher value reads as better (1), worse (-1) or neither
 * (0). Rank columns read as positions (see rankPolarity); calendar years,
 * limits and preferences are neutral; taxes paid, costs and prices are
 * lower-is-better. Otherwise the label is matched against the word lists,
 * then the key (whose leading words often name the page rather than the
 * column), then the topic titles.
 *
 * A negator in the label ("% with Less Than High School Diploma") flips a
 * label or topic match, which names the same subject (education). It does
 * not flip a key match: keys name the negated measure itself
 * ("PovertyRatePctOnLessThan10USDPerDay", "NaturalDisasterRiskLackOf…").
 */
export function guessPolarity(
  label: string,
  key: string,
  fmt: string | null,
  topics: readonly string[]
): -1 | 0 | 1 {
  if (fmt === 'ranking' || RANK_LABEL.test(label))
    return rankPolarity(label, key);
  if (fmt === 'year' || NEUTRAL.test(label)) return 0;
  const tax = taxPolarity(label, key);
  if (tax != null) return tax;
  if (COST.test(label) && !ACCESS.test(label)) return -1;
  if (/\bspeeds?\b/i.test(label)) return 1;
  const negated = NEGATOR.test(label);
  const flip = (p: -1 | 1): -1 | 1 => (negated ? (p === 1 ? -1 : 1) : p);
  const fromLabel = wordPolarity(expandAbbreviations(label));
  if (fromLabel !== 0) return flip(fromLabel);
  const fromKey = wordPolarity(keyText(key));
  if (fromKey !== 0) return fromKey;
  const t = topics.join(' ').replace(/-/g, ' ');
  if (LOWER.test(t) && !HIGHER.test(t)) return flip(-1);
  if (HIGHER.test(t) && !LOWER.test(t)) return flip(1);
  return 0;
}
