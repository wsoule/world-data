// The words of a data story, written around its computed numbers so every figure comes from the
// data: the answer in one sentence, how strong the link is, named examples, the exceptions, party
// averages when the chart is coloured, and a caveat. Flagship stories add a hand-written context
// paragraph (CONTEXT); automatic pair articles use the shared parts only.

import { strength } from '@world-data/stats';

import type { StoryData, StoryMetric, StoryPoint } from '~/content/storyTypes';
import type { EntityType } from '~/data/types';
import { formatValue } from '~/lib/format';

const PLURAL: Record<EntityType, string> = {
  state: 'states',
  county: 'counties',
  city: 'US cities',
  country: 'countries',
  'world-city': 'world cities',
};

/** A metric's name as it reads inside a sentence: without a trailing unit. */
export const shortLabel = (label: string): string => {
  const bare = label.replace(/\s*\([^()]*\)$/, '').trim();
  return bare === '' ? label : bare;
};

const fmt = (m: StoryMetric, v: number) =>
  formatValue({ fmt: m.fmt, unit: m.unit, kind: 'num' }, v);

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

const list = (items: string[]) =>
  items.length <= 1
    ? (items[0] ?? '')
    : `${items.slice(0, -1).join(', ')} and ${items.at(-1)}`;

/** "very strong", "moderate", … or null when there is no clear link. */
export function strengthWord(r: number): string | null {
  const s = strength(r);
  return s === 'none' ? null : s;
}

/** The answer in one sentence: "States with higher X tend to have lower Y." */
export function takeaway(s: StoryData): string {
  const noun = cap(PLURAL[s.type]);
  const x = shortLabel(s.x.label);
  const y = shortLabel(s.y.label);
  const w = strengthWord(s.r);
  if (w == null || s.p >= 0.05)
    return `There is no clear link between ${x} and ${y} across ${PLURAL[s.type]}.`;
  const dir = s.r > 0 ? 'higher' : 'lower';
  const tend = w === 'weak' ? 'tend slightly' : 'tend';
  return `${noun} with higher ${x} ${tend} to have ${dir} ${y}.`;
}

/** "A very strong link: a correlation of −0.85 across 51 states." */
export function strengthLine(s: StoryData): string {
  const w = strengthWord(s.r);
  const r = s.r.toFixed(2).replace('-', '−');
  const across = `across ${s.n.toLocaleString('en-US')} ${PLURAL[s.type]}`;
  if (w == null) return `No clear link: a correlation of ${r} ${across}.`;
  return `${cap(w)} link: a correlation of ${r} ${across}.`;
}

const named = (m: StoryMetric, ps: StoryPoint[], key: 'x' | 'y') =>
  list(ps.map((p) => `${p.name} (${fmt(m, p[key])})`));

/** The shared body: what the numbers say, examples, exceptions, groups and the caveat. */
function sharedParagraphs(s: StoryData): string[] {
  const x = shortLabel(s.x.label);
  const y = shortLabel(s.y.label);
  const noun = PLURAL[s.type];
  const w = strengthWord(s.r);
  const out: string[] = [];
  const share = Math.round(s.r * s.r * 100);
  out.push(
    w == null
      ? `Plotting all ${s.n.toLocaleString('en-US')} ${noun} shows no clear pattern: the correlation is ${s.r.toFixed(2)}, so knowing a place’s ${x} tells you almost nothing about its ${y}.`
      : `Each dot in the chart is one of ${s.n.toLocaleString('en-US')} ${noun}. The correlation between ${x}${s.logX ? ' (on a log scale)' : ''} and ${y} is ${s.r.toFixed(2)}, a ${w} relationship${share >= 10 ? `: about ${share}% of the differences in ${y} from place to place line up with ${x}` : ''}. Ranked instead of measured, the link is ${s.rho.toFixed(2)}.`
  );
  out.push(
    `The highest ${y} is in ${named(s.y, s.top.slice(0, 3), 'y')}; the lowest is in ${named(s.y, s.bottom.slice(0, 3), 'y')}. The median ${noun === 'states' ? 'state' : 'place'} has ${fmt(s.y, s.medianY)} for ${y} and ${fmt(s.x, s.medianX)} for ${x}.`
  );
  if (w != null && s.above.length > 0 && s.below.length > 0)
    out.push(
      `The biggest exceptions sit furthest from the trend line. ${list(s.above.map((p) => p.name))} ${s.above.length === 1 ? 'has' : 'have'} a much higher ${y} than ${s.above.length === 1 ? 'its' : 'their'} ${x} would predict, while ${list(s.below.map((p) => p.name))} ${s.below.length === 1 ? 'has' : 'have'} a much lower one.`
    );
  if (s.groups.length >= 2 && s.color != null) {
    const g = s.groups
      .slice(0, 2)
      .map(
        (gr) =>
          `the ${gr.n.toLocaleString('en-US')} ${noun} where the ${gr.name} candidate won average ${fmt(s.x, gr.meanX)} for ${x}`
      );
    out.push(`Split by the presidential result, ${list(g)}.`);
  }
  out.push(
    `This is a comparison across places, not proof that one causes the other: both can follow from something else, such as income, age or how urban a place is. ${x} is from ${s.x.year ?? 'the latest available year'} and ${y} from ${s.y.year ?? 'the latest available year'}.`
  );
  return out;
}

/** Hand-written context for flagship stories, before the shared body. */
const CONTEXT: Record<string, (s: StoryData) => string> = {
  'education-and-how-states-vote': () =>
    'Since 2016, the share of adults with a college degree has become one of the clearest dividing lines in American presidential voting. Looking at states as a whole shows how tightly that line now holds.',
  'education-and-how-counties-vote': () =>
    'States average over very different places. County by county, the same education divide appears, but rural and urban differences, regional history and local economies add a lot of scatter.',
  'higher-pay-higher-prices': () =>
    'A higher salary in an expensive state does not stretch as far. The Bureau of Economic Analysis measures each state’s price level against the national average, which lets you see how much of a state’s income advantage its prices take back. Rankodex can adjust wages for this anywhere on the site with the cost-of-living switch.',
  'cost-of-living-and-the-vote': () =>
    'Expensive states and Democratic states overlap heavily. Prices track density, coastal housing markets and education, all of which also track the vote, so this is a picture of how those things travel together rather than a cause.',
  'education-and-income-by-state': () =>
    'More degrees and higher pay go together at the state level, partly because college-educated workers earn more and partly because high-paying industries cluster where graduates live.',
  'smoking-and-education-by-county': () =>
    'Smoking used to be common across every group. Today it is concentrated where fewer adults have a college degree, which this county-level view makes plain.',
  'poverty-and-health-by-county': () =>
    'Health researchers have long described a “health gradient”: people with lower incomes report worse health. The CDC’s county estimates show the same pattern place by place.',
  'income-and-obesity-by-county': () =>
    'Obesity rates differ widely between US counties. Income is one of the strongest single predictors of where they are highest.',
  'exercise-and-obesity-by-county': () =>
    'Physical inactivity and obesity are both measured by the CDC from the same national health survey, modelled down to each county.',
  'inactivity-and-diabetes-by-county': () =>
    'Type 2 diabetes is closely tied to activity and weight. Across counties, the share of adults who get no leisure-time exercise lines up with diabetes rates remarkably closely.',
  'broadband-and-income-by-county': () =>
    'The share of homes with a broadband subscription depends on both availability and cost. Across counties it tracks household income closely.',
  'poverty-and-mental-distress-by-county': () =>
    'Frequent mental distress means 14 or more days of poor mental health in the past month. It is more common where more people live in poverty.',
  'education-and-sleep-by-county': () =>
    'Short sleep, under seven hours a night, is more common in some places than others, and it is less common where more adults have degrees.',
  'poverty-and-murder-by-state': () =>
    'Murder rates vary several-fold between states. Poverty explains part of that variation, though large exceptions remain.',
  'climate-and-the-vote': () =>
    'Not every pair of numbers is related. A state’s average temperature tells you very little about how it votes: warm and cold states sit on both sides of the line.',
  'wealth-and-life-expectancy': () =>
    'In 1975 the demographer Samuel Preston described this curve: life expectancy rises steeply with income in poorer countries, then flattens. Plotting income on a log scale, where each step is a doubling, turns the curve into a near straight line.',
  'birth-rates-and-life-expectancy': () =>
    'As countries develop, both mortality and birth rates fall, a shift demographers call the demographic transition. Births per woman and life expectancy move in opposite directions across today’s countries.',
  'electricity-and-infant-deaths': () =>
    'Electricity is a marker of much else: clean water, clinics that can store vaccines, lighting for night-time care. Where access is lowest, infant mortality is highest.',
  'health-spending-and-life-expectancy': () =>
    'Health spending buys longer lives up to a point, then the curve flattens. Some countries sit well above the curve for what they spend, and some, including the United States, sit below it.',
  'wealth-and-carbon-emissions': () =>
    'Carbon emissions per person rise with income, but energy sources and efficiency vary so much that countries with similar incomes can emit very different amounts.',
  'income-and-home-values-by-city': () =>
    'Home values rise with local incomes, but not evenly. Cities far above the trend line are where homes cost the most relative to what households earn.',
  'education-and-violent-crime-by-city': () =>
    'City violent crime rates depend on many things. The share of adults with a degree is one of them, but the link is moderate, so many cities break the pattern.',
};

/** Everything the article page writes: the takeaway, the context and the shared body. */
export function storyText(s: StoryData): {
  takeaway: string;
  strength: string;
  paragraphs: string[];
  /** Teaser for cards and the meta description */
  dek: string;
} {
  const context = CONTEXT[s.slug]?.(s);
  const answer = takeaway(s);
  return {
    takeaway: answer,
    strength: strengthLine(s),
    paragraphs: [...(context != null ? [context] : []), ...sharedParagraphs(s)],
    dek: s.dek !== '' ? s.dek : `${answer} ${strengthLine(s)}`,
  };
}
