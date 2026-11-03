/**
 * Plain-language definitions of the terms the site uses. InfoTip shows `short` next to a term,
 * and the /glossary page lists every entry with its `long` text under an anchor of its id, so the
 * two never disagree. Keep the wording consistent with how the code computes each figure.
 */

export type GlossaryId =
  | 'direction'
  | 'rank'
  | 'percentile'
  | 'coverage'
  | 'median'
  | 'tracks-population'
  | 'cost-of-living'
  | 'combined-score'
  | 'weight'
  | 'normalisation'
  | 'z-score'
  | 'correlation'
  | 'pearson'
  | 'spearman'
  | 'p-value'
  | 'r-squared'
  | 'trend-line'
  | 'log-scale'
  | 'overlay'
  | 'rank-lines'
  | 'head-to-head';

export interface GlossaryEntry {
  id: GlossaryId;
  term: string;
  /** One or two sentences, shown in the InfoTip popover */
  short: string;
  /** Fuller explanation for the glossary page */
  long: string;
}

export interface GlossarySection {
  title: string;
  ids: GlossaryId[];
}

const ENTRIES: GlossaryEntry[] = [
  {
    id: 'direction',
    term: 'Better direction',
    short:
      'Whether a higher or a lower value is better. A green arrow means higher is better, a red arrow means lower is better, and no arrow means neither.',
    long: 'Each metric has a direction: income and life expectancy are better when higher, crime and unemployment when lower, and things like population or area are neutral. Ranks, percentiles and combined scores use it so that “best” always means the good end. In a combined ranking you can flip a metric’s direction if you disagree.',
  },
  {
    id: 'rank',
    term: 'Rank',
    short:
      'A place’s position in the list for one metric, best first. “3rd of 50” means two places did better.',
    long: 'Rank 1 is the best place for that metric, using its better direction; for neutral metrics it is the highest value. Places with the same value share a rank, and the “of N” count only includes places that have data. Some source metrics are rankings themselves, such as a published education rank; their arrow’s tooltip says whether rank 1 is the best or the worst.',
  },
  {
    id: 'percentile',
    term: 'Percentile',
    short:
      'Where a place sits among all places, from 0 to 100. 100 is the best, 50 is the middle, 0 is the worst.',
    long: 'A percentile of 80 means the place does better than about 80% of the places with data for that metric. It uses the better direction, so a high percentile is always good. Percentiles let you compare metrics with very different units, such as dollars and years.',
  },
  {
    id: 'coverage',
    term: 'Data coverage',
    short:
      'How many places have a value for a metric, such as “48/51”. Places without data are left out of that metric’s ranks.',
    long: 'Sources rarely cover every place. A metric marked 48/51 has values for 48 of 51 places. In a combined ranking, “minimum data coverage” is the share of the total weight a place needs data for before it gets a score, so a place missing most metrics is not ranked on the one or two it has.',
  },
  {
    id: 'median',
    term: 'Median and middle half',
    short:
      'The median is the middle value: half of places are above it, half below. The middle half is the range holding the central 50% of places.',
    long: 'Unlike the average, the median is not pulled up or down by a few extreme places. The middle half (the interquartile range) runs from the 25th to the 75th percentile of values, so it shows what is typical while ignoring the top and bottom quarter.',
  },
  {
    id: 'tracks-population',
    term: 'Totals that track population',
    short:
      'Counts like “number of burglaries” that mostly reflect how many people live somewhere, so big places rank high or low regardless.',
    long: 'A metric is treated as tracking population when its values rise closely with population (a rank correlation of 0.75 or more, or 0.5 or more when the same figure per resident no longer does). Leaving these out keeps strengths and weak spots about the place itself rather than its size.',
  },
  {
    id: 'cost-of-living',
    term: 'Cost-of-living adjustment',
    short:
      'Converts wages and incomes to what they would buy at average US prices, so $100k in a cheap state and $100k in an expensive one are not treated as equal.',
    long: 'The adjustment divides each value by the place’s price level from the Bureau of Economic Analysis (Regional Price Parities, US average = 100) and multiplies by 100. A state with a price level of 110 has prices 10% above average, so $110,000 there buys what $100,000 does on average. It applies only to earnings and income; prices, rents and taxes are shown as they are, since adjusting a price by a price index would count the same difference twice. Price levels are available for US states.',
  },
  {
    id: 'combined-score',
    term: 'Combined score',
    short:
      'One score built from several metrics: each is put on a common scale, flipped so better is higher, weighted, and averaged.',
    long: 'A combined ranking turns several metrics into one number per place. Each metric is normalised (by default to percentiles), oriented by its better direction, multiplied by its weight, and averaged over the metrics the place has data for. The result ranks places on everything at once, such as “best states to live in”.',
  },
  {
    id: 'weight',
    term: 'Weight',
    short:
      'How much a metric counts in a combined score. A weight of 2 counts twice as much as 1; 0 leaves it out.',
    long: 'Weights let you say what matters to you. They are relative: setting every metric to 3 gives the same ranking as setting them all to 1.',
  },
  {
    id: 'normalisation',
    term: 'Normalisation',
    short:
      'How metrics in different units are put on one scale before combining: percentiles (default), z-scores, or min–max.',
    long: 'Percentiles rank places from 0 to 100 and ignore how far apart they are, so outliers cannot dominate. Z-scores measure distance from the average in standard deviations, rewarding places that stand far out. Min–max stretches values linearly from 0 (worst) to 100 (best), keeping gaps, so a single extreme place squeezes everyone else together.',
  },
  {
    id: 'z-score',
    term: 'Z-score',
    short:
      'How far a value is from the average, in standard deviations. 0 is average, +1 is one step better than typical, −2 is far worse.',
    long: 'A standard deviation is the typical distance of values from their average. Z-scores have no fixed range, so a combined z-score score is not out of 100; positive means better than average.',
  },
  {
    id: 'correlation',
    term: 'Correlation',
    short:
      'How closely two metrics move together, from −1 to +1. Near +1: both rise together. Near −1: one rises as the other falls. Near 0: no clear link.',
    long: 'This site calls a correlation notable at 0.3 or more in either direction, and strong as it nears ±1. Correlation is not causation: two metrics can move together because both depend on something else, such as income or population.',
  },
  {
    id: 'pearson',
    term: 'Pearson r',
    short:
      'Correlation on the raw values: how well a straight line fits the points. Sensitive to outliers.',
    long: 'Pearson’s r measures a straight-line relationship between the actual values. One extreme place can raise or lower it a lot, so compare it with Spearman ρ, or try a log scale for skewed metrics.',
  },
  {
    id: 'spearman',
    term: 'Spearman ρ',
    short:
      'Correlation on rank order instead of raw values. Catches any steady up-or-down relationship and shrugs off outliers.',
    long: 'Spearman’s ρ (rho) replaces each value by its rank and then correlates the ranks. It is high whenever places that rank well on one metric tend to rank well on the other, even when the relationship curves.',
  },
  {
    id: 'p-value',
    term: 'p-value',
    short:
      'The chance of seeing a link this strong by luck if there were really none. Below 0.05 is called significant.',
    long: 'A small p-value means the pattern is unlikely to be a coincidence of which places happen to be in the data. It says nothing about how strong or important the link is: with many places, even a weak correlation can be significant.',
  },
  {
    id: 'r-squared',
    term: 'R²',
    short:
      'The share of the differences in the vertical metric that the trend line explains, from 0% to 100%.',
    long: 'R² is the square of Pearson’s r. An R² of 0.40 means 40% of the variation from place to place in the vertical metric lines up with the horizontal one; the other 60% is down to other things.',
  },
  {
    id: 'trend-line',
    term: 'Trend line',
    short:
      'The straight line that best fits the dots, with a shaded band showing where the true line likely is (95% confidence).',
    long: 'Places above the line do better on the vertical metric than their horizontal value predicts, and places below do worse; the overlay calls the biggest ones over- and under-performers. A wide band means the trend is uncertain.',
  },
  {
    id: 'log-scale',
    term: 'Log scale',
    short:
      'An axis where each step multiplies instead of adds (10, 100, 1,000). Useful when a few places dwarf the rest.',
    long: 'On a log axis, equal distances are equal ratios, so a place twice as big is always the same distance further along. It spreads out values bunched near zero and needs every value to be above zero.',
  },
  {
    id: 'overlay',
    term: 'Overlay',
    short:
      'A scatter plot of two metrics, one dot per place, to see whether they go together.',
    long: 'Pick a horizontal and a vertical metric; each place becomes a dot. Dot size and colour can show a third and fourth metric. The panel beside it gives the correlation, the trend line and the places that buck the trend.',
  },
  {
    id: 'rank-lines',
    term: 'Rank lines',
    short:
      'One column per metric with places ordered by rank; a line follows each place across them.',
    long: 'Rank lines show at a glance whether a place is consistently near the top, or strong on some metrics and weak on others. Crossing lines mean the metrics disagree about who is best.',
  },
  {
    id: 'head-to-head',
    term: 'Head to head',
    short:
      'Two to four places side by side on every metric they share, with the better value marked.',
    long: 'Head to head counts who wins on each shared metric, using its better direction, and lets you filter by category. Metrics without a better direction are shown but not scored.',
  },
];

export const GLOSSARY: Record<GlossaryId, GlossaryEntry> = Object.fromEntries(
  ENTRIES.map((e) => [e.id, e])
) as Record<GlossaryId, GlossaryEntry>;

/** Glossary page order: everyday terms first, statistics last. */
export const GLOSSARY_SECTIONS: GlossarySection[] = [
  {
    title: 'Reading a ranking',
    ids: [
      'direction',
      'rank',
      'percentile',
      'coverage',
      'median',
      'tracks-population',
      'cost-of-living',
    ],
  },
  {
    title: 'Ways to compare',
    ids: [
      'overlay',
      'combined-score',
      'weight',
      'normalisation',
      'rank-lines',
      'head-to-head',
    ],
  },
  {
    title: 'Statistics',
    ids: [
      'correlation',
      'pearson',
      'spearman',
      'p-value',
      'r-squared',
      'trend-line',
      'z-score',
      'log-scale',
    ],
  },
];
