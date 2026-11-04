import { Link } from '@tanstack/react-router';

import { HISTORY_URL, PIPELINE_URL } from './links';
import {
  OutLink,
  PROSE_LINK,
  TrustLayout,
  TrustSection,
  type TrustSectionInfo,
} from './TrustLayout';
import type { GlossaryId } from '~/lib/glossary';
import { SITE } from '~/site';

const SECTIONS = {
  sources: { id: 'sources', title: 'Where the data comes from' },
  pipeline: { id: 'pipeline', title: 'From source pages to one dataset' },
  years: { id: 'years', title: 'Which year you see' },
  direction: { id: 'direction', title: 'Which direction is better' },
  ranks: { id: 'ranks', title: 'Ranks and percentiles' },
  combined: { id: 'combined', title: 'Combined rankings' },
  correlation: { id: 'correlation', title: 'Correlations' },
  adjustments: { id: 'adjustments', title: 'Adjustments' },
  profiles: { id: 'profiles', title: 'Place profiles and stories' },
  updates: { id: 'updates', title: 'Updates and limits' },
} satisfies Record<string, TrustSectionInfo>;

/** A link to one glossary entry, for terms the methodology uses. */
function Term({ id, children }: { id: GlossaryId; children: string }) {
  return (
    <Link to="/glossary" hash={id} className={PROSE_LINK}>
      {children}
    </Link>
  );
}

/**
 * /methodology: how the pipeline compiles and cleans the data, and how the site computes the
 * figures it shows. Every rule here mirrors the code (scripts/build-data.ts, packages/stats,
 * src/data/adjustments.ts and the feature models); change the text when the code changes.
 */
export function MethodologyPage() {
  return (
    <TrustLayout
      id="methodology"
      sections={Object.values(SECTIONS)}
      lede={
        <p>
          How {SITE.name} turns published rankings and agency files into one
          dataset, and how it computes the ranks, percentiles, combined scores
          and correlations you see. For short definitions of each term, see the{' '}
          <Link to="/glossary" className={PROSE_LINK}>
            glossary
          </Link>
          .
        </p>
      }
    >
      <TrustSection section={SECTIONS.sources}>
        <p>
          Most topics come from the ranking pages of World Population Review,
          which compiles each list from the primary sources it cites. A smaller
          set is built directly from files published by agencies such as the
          Census Bureau, the Bureau of Economic Analysis, the Bureau of Labor
          Statistics, the CDC, the EPA, the FBI, NOAA and the World Bank.{' '}
          <Link to="/sources" className={PROSE_LINK}>
            Sources and licensing
          </Link>{' '}
          lists them, and each topic page credits its own.
        </p>
      </TrustSection>

      <TrustSection section={SECTIONS.pipeline}>
        <p>
          A <OutLink href={PIPELINE_URL}>build pipeline</OutLink> turns the
          sources into the dataset the site reads. In order, it:
        </p>
        <ol>
          <li>
            <strong>Downloads</strong> the ranking pages for countries, US
            states, US cities, world cities and US counties into a local cache,
            a few at a time (the source’s robots.txt allows this), along with
            the agency files. Cached pages are not downloaded again unless a
            refresh is asked for.
          </li>
          <li>
            <strong>Reads the data tables</strong> embedded in each page,
            keeping the numbers, the column and page titles, the source
            citations and the date the page was last updated. It does not copy
            the pages’ articles.
          </li>
          <li>
            <strong>Matches every row to one place.</strong> Countries are
            identified by their three-letter ISO code, US states by postal code
            (the District of Columbia included), counties by their five-digit
            FIPS code and cities by name, so the same place lines up across
            every topic. Agency rows for places that are not on the site, such
            as World Bank regions, are dropped.
          </li>
          <li>
            <strong>Cleans the values.</strong> Figures such as “$1,234”, “12%”
            or “+3” are read as numbers, and placeholders such as “N/A” or “—”
            count as missing. Figures stored in another unit than their label
            are converted: populations stored in thousands, distances stored in
            kilometres under a miles label, money stored in millions or
            billions, and ratios stored the other way up (males per female under
            a “females per male” label).
          </li>
          <li>
            <strong>Recognises rank columns.</strong> A column named as a rank
            or ranking that holds whole numbers from 1 up is treated as
            positions (1st, 2nd…), not as an amount.
          </li>
          <li>
            <strong>Removes noise.</strong> A count column that only repeats
            another column of the same year is dropped, a statistic with no
            values is left off its topic, and a topic with nothing left is not
            published. A short list of hand corrections fixes column titles,
            units and formats the source gets wrong; individual values are never
            edited by hand.
          </li>
        </ol>
      </TrustSection>

      <TrustSection section={SECTIONS.years}>
        <p>
          Many statistics come with several years. Each one opens on a default
          year, chosen by these rules:
        </p>
        <ul>
          <li>
            The latest year that covers at least half as many places as the
            best-covered year wins, so a year with only a few early figures does
            not.
          </li>
          <li>
            Projections (years after the year the dataset is built) count only
            when there is nothing else.
          </li>
          <li>
            If that year is more than five years older than the newest data, the
            newest year covering at least 15% as many places (and at least 5)
            wins instead.
          </li>
          <li>
            An undated column that covers at least 1.5 times as many places
            beats the dated choice.
          </li>
        </ul>
        <p>
          Topic pages let you switch to any other year the source has. Because
          sources publish on different schedules, two statistics on the same
          page or comparison can refer to different years.
        </p>
      </TrustSection>

      <TrustSection section={SECTIONS.direction}>
        <p>
          Each statistic has a <Term id="direction">better direction</Term>:
          higher is better (income, life expectancy), lower is better (crime,
          unemployment, costs), or neutral (population, area, preferences,
          years). The direction is set from the statistic’s name by fixed rules,
          then from its topic. Taxes residents pay count as lower-is-better,
          while tax collections, shares and brackets are neutral.
        </p>
        <p>
          The rules are a judgement call, not a fact about the data. In
          comparisons and combined rankings you can flip any statistic’s
          direction, and the change is kept in the link you share.
        </p>
        <p>
          Published ranks need care: on most lists rank 1 is the best place, but
          on a “worst” or “most dangerous” list rank 1 is the worst. {SITE.name}{' '}
          reads ranks by standing, so a better standing always counts as better
          in percentiles, colours, correlations and combined scores, and a topic
          page lists such a column rank 1 first, as the source does.
        </p>
      </TrustSection>

      <TrustSection section={SECTIONS.ranks}>
        <p>
          A place’s <Term id="rank">rank</Term> is its position among the places
          that have data, counted in the better direction (for a neutral
          statistic, from the highest value). Places with the same value share a
          rank, as in 1, 2, 2, 4, and “3rd of 50” counts only the 50 places with
          data.
        </p>
        <p>
          A <Term id="percentile">percentile</Term> runs from 0 (the worst
          place) to 100 (the best), based on ranks with ties averaged, so
          statistics in different units can be compared. Places without data are
          left out of both.
        </p>
      </TrustSection>

      <TrustSection section={SECTIONS.combined}>
        <p>
          A <Term id="combined-score">combined ranking</Term> turns several
          statistics into one score per place:
        </p>
        <ol>
          <li>
            Each statistic is put on a common scale (
            <Term id="normalisation">normalised</Term>): percentiles by default,
            or z-scores or min–max scaling.
          </li>
          <li>Each is turned so that better is higher, using its direction.</li>
          <li>
            Each is multiplied by its <Term id="weight">weight</Term>, and the
            results are averaged over the statistics the place has data for.
          </li>
        </ol>
        <p>
          A place is scored only if it has data for at least half of the total
          weight by default (the{' '}
          <Term id="coverage">minimum data coverage</Term>, which you can
          change), so a place missing most statistics is not ranked on the one
          or two it has. The ready-made rankings use only statistics that cover
          at least 85% of places, relaxed to 60% or 35% for place types with
          sparse data, and skip statistics that mostly track population or
          nearly duplicate another one.
        </p>
      </TrustSection>

      <TrustSection section={SECTIONS.correlation}>
        <p>
          A <Term id="correlation">correlation</Term> measures how closely two
          statistics move together across places, from −1 to +1. {SITE.name}{' '}
          reports two kinds:
        </p>
        <ul>
          <li>
            <Term id="pearson">Pearson r</Term> on the values themselves, which
            measures a straight-line relationship and can be swayed by a few
            extreme places.
          </li>
          <li>
            <Term id="spearman">Spearman ρ</Term> on the places’ ranks, which
            catches any steady up-or-down relationship and is not swayed by
            outliers.
          </li>
        </ul>
        <p>
          Both use only the places that have a value for both statistics, and
          need at least three. The <Term id="p-value">p-value</Term> is
          two-sided, from Student’s t distribution with n − 2 degrees of
          freedom; below 0.05 is called statistically significant. Strength is
          worded from the size of r: under 0.1 is no meaningful relationship,
          then weak (under 0.3), moderate (under 0.5), strong (under 0.7) and
          very strong.
        </p>
        <p>
          On a topic page, “what correlates” tests the topic’s statistic (with
          Pearson r) against every numeric statistic of other topics for the
          same kind of place that shares at least 10 places and 60% of its
          coverage. Near-identical copies of the same series (|r| of 0.995 or
          more) are skipped and relationships under 0.1 are not listed. Ranks
          are read by standing, so with a rank a positive r means a better rank,
          not a bigger number.
        </p>
        <p>
          A correlation across places is not causation, and says nothing about
          individual people: two statistics can move together because both
          depend on something else, such as income or population.
        </p>
      </TrustSection>

      <TrustSection section={SECTIONS.adjustments}>
        <p>
          Topic pages and comparisons can adjust figures that are hard to
          compare as published. Each is offered only where it applies:
        </p>
        <ul>
          <li>
            <Term id="cost-of-living">Cost of living</Term> puts wages and
            incomes at the US-average price level, using the Bureau of Economic
            Analysis’s Regional Price Parities for states and US cities (each
            city takes its metro area’s) and the World Bank’s price level for
            countries. Prices, rents and taxes are left as they are.
          </li>
          <li>
            <Term id="share-of-income">Share of income</Term> divides household
            costs such as rent, home values, child care and insurance premiums
            by the place’s median household income from the Census Bureau (GDP
            per person for countries), as a percentage of income or as years of
            income.
          </li>
          <li>
            <Term id="per-person">Per person</Term> divides totals that grow
            with population by the number of residents: per 100,000 people for
            counts and per person for money.
          </li>
        </ul>
      </TrustSection>

      <TrustSection section={SECTIONS.profiles}>
        <p>
          A place profile calls a place best or worst at something only on
          rankings that cover at least half of the places of its kind, or on
          partial rankings of the largest places. Top lists picked by their own
          statistic, such as “the richest cities”, say nothing about places that
          are not on them, so they are not used for those claims.{' '}
          <Term id="tracks-population">
            Totals that mostly track population
          </Term>{' '}
          are left out of strengths and weak spots, so a profile is about the
          place rather than its size.
        </p>
        <p>
          Data stories are computed when the dataset is built: the charts,
          tables and every figure in their text come from the same dataset, and
          the text is written around those numbers.
        </p>
      </TrustSection>

      <TrustSection section={SECTIONS.updates}>
        <p>
          The dataset is rebuilt when the pipeline is run again, not on a fixed
          schedule. Each rebuild is committed to the public repository, so its{' '}
          <OutLink href={HISTORY_URL}>history</OutLink> shows what changed and
          when, and the footer of every page shows the date of the current
          build. Topic pages show the date their source last updated the
          figures, when the source gives one.
        </p>
        <p>
          Figures can lag their sources, sources can revise past values, and
          errors in a source carry over until it corrects them. If you spot one,{' '}
          <Link to="/contact" className={PROSE_LINK}>
            report it
          </Link>
          .
        </p>
      </TrustSection>
    </TrustLayout>
  );
}
