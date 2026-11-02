// Static reference data used while building the dataset.

export const STATE_REGIONS = {
  CT: 'Northeast', ME: 'Northeast', MA: 'Northeast', NH: 'Northeast', RI: 'Northeast', VT: 'Northeast', NJ: 'Northeast', NY: 'Northeast', PA: 'Northeast',
  IL: 'Midwest', IN: 'Midwest', MI: 'Midwest', OH: 'Midwest', WI: 'Midwest', IA: 'Midwest', KS: 'Midwest', MN: 'Midwest', MO: 'Midwest', NE: 'Midwest', ND: 'Midwest', SD: 'Midwest',
  DE: 'South', FL: 'South', GA: 'South', MD: 'South', NC: 'South', SC: 'South', VA: 'South', DC: 'South', WV: 'South', AL: 'South', KY: 'South', MS: 'South', TN: 'South', AR: 'South', LA: 'South', OK: 'South', TX: 'South',
  AZ: 'West', CO: 'West', ID: 'West', MT: 'West', NV: 'West', NM: 'West', UT: 'West', WY: 'West', AK: 'West', CA: 'West', HI: 'West', OR: 'West', WA: 'West',
  PR: 'Territory', GU: 'Territory', VI: 'Territory', AS: 'Territory', MP: 'Territory',
}

export const CATEGORY_LABELS = {
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
}

// Words that usually mean "lower is better" / "higher is better" for a quality-of-life reading.
// This only seeds the default direction in composite rankings; users can flip any metric.
const LOWER = /\b(crime|crimes|criminal|murder|homicide|violent|violence|theft|robbery|burglary|assault|rape|kidnap|terror|death|deaths|dead|died|mortality|fatal|fatality|fatalities|killed|suicide|overdose|poverty|poor|unemploy\w*|debt|deficit|inflation|pollution|polluted|emission|emissions|co2|carbon|smog|pm2\.?5|obes\w*|smok\w*|tobacco|alcoholism|drunk\w*|drug|opioid|disease|cancer|diabetes|hiv|aids|malaria|tuberculosis|infection|stress|depress\w*|anxiety|corruption|corrupt|inequality|gini|risk|danger\w*|dangerous|worst|unsafe|incarcerat\w*|prison|prisoners|inmates|eviction|homeless\w*|cost of living|rent burden|tax burden|commute|traffic|congestion|accident|accidents|crash|crashes|injur\w*|abuse|fraud|scam|hate|bankrupt\w*|foreclosure|uninsured|stillbirth|underweight|stunting|malnutrition|hunger|starvation|undernourish\w*|illiteracy|dropout|fragile|fragility|misery)\b/i
const HIGHER = /\b(gdp|income|wage|wages|salary|salaries|earnings|wealth|wealthiest|richest|happiness|happiest|happy|life expectancy|literacy|literate|education|educated|graduation|attainment|hdi|human development|freedom|free|democracy|peace|peaceful|safety|safest|safe|quality|best|innovation|competitiveness|prosperity|well-being|wellbeing|purchasing power|press freedom|internet speed|broadband|access|insured|vaccination|vaccinated|employment rate|labor force|productivity|patents|healthiest|cleanest|greenest|renewable|forest|biodiversity|tolerance|trust|satisfaction|longevity|iq|pisa|test scores)\b/i

// Phrases that invert the meaning of the word they precede ("never smoked", "less than high school").
const NEGATOR = /\b(less than|without|lack of|lacking|no access|never|non[- ]?smok\w*)\b|-free\b/i

export function guessPolarity(label, key, fmt, topics) {
  if (fmt === 'ranking' || /\brank(ing)?\b/i.test(label)) return -1
  const text = `${label} ${String(key).replace(/([a-z])([A-Z])/g, '$1 $2')}`
  const t = topics.join(' ').replace(/-/g, ' ')
  let pol = 0
  if (LOWER.test(text)) pol = -1
  else if (HIGHER.test(text)) pol = 1
  else if (LOWER.test(t) && !HIGHER.test(t)) pol = -1
  else if (HIGHER.test(t) && !LOWER.test(t)) pol = 1
  return NEGATOR.test(label) ? -pol : pol
}
