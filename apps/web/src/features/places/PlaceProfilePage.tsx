import { getRouteApi, Link, useNavigate } from '@tanstack/react-router';
import { BarChart3, ChevronRight } from 'lucide-react';
import { Fragment, useMemo, useRef, useState } from 'react';

import { AtAGlance } from './AtAGlance';
import { CategoryChart } from './CategoryChart';
import {
  datasetFacts,
  growthMetricId,
  placeNoun,
  similarityBasisFor,
} from './datasetFacts';
import { useCategoryLabels } from './hooks';
import { MetricExplorer } from './MetricExplorer';
import { GROUP_LABEL } from './PlacesPage';
import { PlaceStories } from './PlaceStories';
import {
  basisCoverage,
  categoryScores,
  MIN_SIMILARITY_METRICS,
  notableFacts,
  placeStandings,
  qualifyingRows,
  similarPlaces,
  standingAt,
  strengthsAndWeaknesses,
} from './profileModel';
import {
  HeaderStat,
  NotableFacts,
  RelatedPlaceList,
  SimilarPlaces,
  StrengthList,
} from './ProfileSections';
import type { RelatedPlaces } from './relatedPlaces';
import { Choropleth } from '~/charts/Choropleth';
import { EntityPicker } from '~/components/EntityPicker';
import { EmptyState } from '~/components/feedback';
import { Flag } from '~/components/Flag';
import { InfoTip } from '~/components/InfoTip';
import { QuickAnswers } from '~/components/QuickAnswers';
import { Card } from '~/components/ui';
import { type Dataset, useDataset } from '~/data/dataset';
import { type EntityType, isEntityType } from '~/data/types';
import {
  formatInt,
  formatValue,
  ordinal,
  plural,
  typeNoun,
} from '~/lib/format';
import { useTheme } from '~/lib/theme';
import type { QA } from '~/seo/content';

const route = getRouteApi('/places/$type/$slug');

/** Place types drawn on a map (cities as dots, counties and the rest as regions). */
const MAPPED: readonly EntityType[] = [
  'country',
  'state',
  'county',
  'city',
  'world-city',
];

/** Server-computed content from the route loader, embedded in the prerendered HTML. */
interface ProfileContent {
  /** Answer-first summary shown under the place name */
  summary: string;
  /** Quick answers, also emitted as FAQPage structured data */
  faq: readonly QA[];
  /** Parent place and the places inside this one */
  related: RelatedPlaces;
}

export function PlaceProfilePage(content: ProfileContent) {
  const params = route.useParams();
  const type: EntityType = isEntityType(params.type) ? params.type : 'country';
  const dataset = useDataset(type);
  const index = dataset.entityBySlug.get(params.slug);
  if (index == null)
    return (
      <EmptyState title="Place not found">
        <Link to="/places/$type" params={{ type }} className="underline">
          Browse all {dataset.type.label}
        </Link>
      </EmptyState>
    );
  return (
    <Profile
      key={`${type}/${index}`}
      dataset={dataset}
      index={index}
      {...content}
    />
  );
}

/** The report card for one place. Keyed by place so local filters reset on navigation. */
function Profile({
  dataset,
  index,
  summary,
  faq,
  related,
}: { dataset: Dataset; index: number } & ProfileContent) {
  const entity = dataset.entities[index];
  const type = dataset.type.id;
  const theme = useTheme();
  const categoryLabel = useCategoryLabels();
  const [hideSize, setHideSize] = useState(true);
  const [category, setCategory] = useState('');
  const explorerRef = useRef<HTMLDivElement>(null);

  const facts = datasetFacts(dataset);
  const rows = useMemo(
    () => placeStandings(dataset, index, facts.rankable),
    [dataset, index, facts]
  );
  // Top-N lists picked by their own metric never count; population totals only while hidden.
  const exclude = useMemo(() => {
    const out = new Set(facts.selectedLists);
    if (hideSize) for (const id of facts.sizeDriven) out.add(id);
    return out;
  }, [hideSize, facts]);
  // This place's top-N list metrics that would otherwise qualify, for the note under the heading.
  const listCount = useMemo(
    () =>
      rows.filter(
        (r) =>
          facts.selectedLists.has(r.metric.id) && r.standing.n >= facts.cut.minN
      ).length,
    [rows, facts]
  );
  const qualifying = useMemo(
    () => qualifyingRows(rows, facts.cut, exclude),
    [rows, facts, exclude]
  );
  const strengths = useMemo(
    () => strengthsAndWeaknesses(qualifying, 10),
    [qualifying]
  );
  const categories = useMemo(() => categoryScores(qualifying, 3), [qualifying]);
  const notable = useMemo(
    () => notableFacts(rows, facts.cut, exclude),
    [rows, facts, exclude]
  );
  const basis = similarityBasisFor(dataset);
  const similar = useMemo(
    () => similarPlaces(basis, index, dataset.entities.length),
    [basis, index, dataset]
  );
  // How many basis metrics, from how many categories, this place can be compared on.
  const basisFit = useMemo(() => {
    const cats = new Set<string>();
    basis.columns.forEach((col, k) => {
      if (!Number.isNaN(col[index])) cats.add(basis.categories[k]);
    });
    return { metrics: basisCoverage(basis, index), categories: cats.size };
  }, [basis, index]);
  // Size-driven metrics this place actually has, for the toggle label.
  const sizeCount = useMemo(
    () =>
      rows.filter(
        (r) =>
          facts.sizeDriven.has(r.metric.id) && r.standing.n >= facts.cut.minN
      ).length,
    [rows, facts]
  );

  const pickCategory = (c: string) => {
    setCategory((prev) => (prev === c ? '' : c));
    explorerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const workbenchMetrics = [
    ...strengths.best.slice(0, 3),
    ...strengths.worst.slice(0, 2),
  ].map((r) => r.metric.id);
  const coverageNote =
    facts.cut.share >= 0.5
      ? `at least half of all ${placeNoun(dataset)}`
      : `at least ${formatInt(facts.cut.minN)} places`;

  return (
    <div className="space-y-6">
      <ProfileHeader
        dataset={dataset}
        index={index}
        metricCount={rows.length}
        summary={summary}
        parent={related.parent}
        workbenchMetrics={
          workbenchMetrics.length > 0 ? workbenchMetrics : [-1, -2]
        }
      />

      <AtAGlance dataset={dataset} index={index} />

      <section aria-labelledby="strengths-heading" className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2
              id="strengths-heading"
              className="flex items-center gap-1.5 text-lg font-semibold"
            >
              Strengths and weak spots
              <InfoTip term="percentile" />
            </h2>
            <p className="text-muted text-sm">
              {qualifying.length > 0
                ? `Percentile on ${plural(qualifying.length, 'metric')} that ${qualifying.length === 1 ? 'ranks' : 'rank'} ${coverageNote}, given whether higher or lower is better.`
                : `Based on metrics that rank ${coverageNote} and have a better and a worse end.`}
              {listCount > 0
                ? ` ${plural(listCount, 'metric')} from top lists such as “the most violent” ${listCount === 1 ? 'is' : 'are'} left out, since ${listCount === 1 ? 'it ranks' : 'they rank'} only one end of the scale.`
                : ''}
            </p>
          </div>
          {sizeCount > 0 ? (
            <span className="inline-flex items-center gap-1">
              <label className="text-muted inline-flex cursor-pointer items-center gap-2 text-xs">
                <input
                  type="checkbox"
                  checked={hideSize}
                  onChange={(e) => setHideSize(e.target.checked)}
                  className="accent-accent-600"
                />
                Leave out totals that track population
                <span className="tabular opacity-70">({sizeCount})</span>
              </label>
              <InfoTip term="tracks-population" />
            </span>
          ) : null}
        </div>
        {qualifying.length > 0 ? (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <StrengthList
              dataset={dataset}
              rows={strengths.best}
              tone="good"
              theme={theme}
            />
            <StrengthList
              dataset={dataset}
              rows={strengths.worst}
              tone="bad"
              theme={theme}
            />
          </div>
        ) : (
          <p className="card text-muted px-4 py-6 text-center text-sm">
            Not enough widely ranked metrics to name strengths and weak spots.
            Every value this place has is listed under Every metric below.
          </p>
        )}
      </section>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_24rem]">
        <div className="min-w-0 space-y-6">
          <Card
            title="Profile by category"
            subtitle={
              categories.length > 0
                ? 'Average percentile per category, from the median line. Select a category to list its metrics.'
                : undefined
            }
          >
            {categories.length > 0 ? (
              <CategoryChart
                scores={categories}
                label={categoryLabel}
                selected={category}
                onSelect={pickCategory}
              />
            ) : (
              <p className="text-muted py-6 text-center text-sm">
                No category has three or more widely ranked metrics for this
                place.
              </p>
            )}
          </Card>
          <NotableFacts dataset={dataset} facts={notable} />
        </div>
        <div className="min-w-0 space-y-6">
          {MAPPED.includes(type) ? (
            <Locator dataset={dataset} index={index} />
          ) : null}
          {basisFit.metrics >= MIN_SIMILARITY_METRICS ? (
            <SimilarPlaces
              dataset={dataset}
              entity={entity}
              similar={similar}
              basisMetrics={basisFit.metrics}
              basisCategories={basisFit.categories}
            />
          ) : null}
        </div>
      </div>

      {related.children.map((group) => (
        <RelatedPlaceList key={group.type} group={group} />
      ))}

      <PlaceStories dataset={dataset} index={index} />

      <QuickAnswers items={faq} />

      <div ref={explorerRef} className="scroll-mt-20">
        <MetricExplorer
          dataset={dataset}
          rows={rows}
          category={category}
          onCategory={setCategory}
          categoryLabel={categoryLabel}
          theme={theme}
          sizeDriven={facts.sizeDriven}
        />
      </div>
    </div>
  );
}

/**
 * Name, place in the hierarchy, headline numbers with ranks, and the two ways out: a
 * head-to-head with another place and the compare workbench with this place highlighted.
 */
function ProfileHeader({
  dataset,
  index,
  metricCount,
  summary,
  parent,
  workbenchMetrics,
}: {
  dataset: Dataset;
  index: number;
  /** Metrics with a value for this place, as listed under Every metric */
  metricCount: number;
  summary: string;
  parent: RelatedPlaces['parent'];
  workbenchMetrics: number[];
}) {
  const navigate = useNavigate();
  const entity = dataset.entities[index];
  const type = dataset.type.id;
  const stats = useMemo(() => headerStats(dataset, index), [dataset, index]);
  const where = [entity.sub, entity.group]
    .filter((p): p is string => p != null && p !== '')
    .filter((p, i, all) => all.indexOf(p) === i);

  return (
    <header className="space-y-5">
      <nav
        aria-label="Breadcrumb"
        className="text-muted flex items-center gap-1 text-xs"
      >
        <Link to="/places/$type" params={{ type }} className="hover:text-app">
          {dataset.type.label}
        </Link>
        <ChevronRight className="size-3" aria-hidden />
        <span className="text-app truncate">{entity.name}</span>
      </nav>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-center gap-4">
          <Flag
            entity={entity}
            type={type}
            size={56}
            className="rounded-md shadow-sm"
          />
          <div className="min-w-0">
            <h1 className="truncate text-2xl font-semibold tracking-tight md:text-3xl">
              {entity.name}
            </h1>
            <p className="text-muted mt-0.5 text-sm">
              {dataset.type.singular}
              {where.length > 0 ? ' in ' : ''}
              {where.map((part, k) => (
                <Fragment key={part}>
                  {k > 0 ? ', ' : ''}
                  {parent != null && part === parent.name ? (
                    <Link
                      to="/places/$type/$slug"
                      params={{ type: parent.type, slug: parent.slug }}
                      className="hover:text-accent-600 dark:hover:text-accent-300 underline decoration-dotted underline-offset-2"
                    >
                      {part}
                    </Link>
                  ) : (
                    part
                  )}
                </Fragment>
              ))}
              {' · '}
              ranked on {plural(metricCount, 'metric')}
            </p>
          </div>
        </div>
        <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
          <EntityPicker
            dataset={dataset}
            exclude={[entity.id]}
            placeholder="Compare with…"
            className="min-w-44 flex-1 sm:w-56 sm:flex-none"
            onSelect={(id) =>
              void navigate({ to: '/vs', search: { type, e: [entity.id, id] } })
            }
          />
          <Link
            to="/compare"
            search={{
              type,
              view: 'table',
              m: workbenchMetrics,
              hl: [entity.id],
            }}
            className="bg-accent-600 hover:bg-accent-700 inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium whitespace-nowrap text-white max-sm:flex-1"
          >
            <BarChart3 className="size-4" aria-hidden />
            Rank among {typeNoun(dataset.type.label)}
          </Link>
        </div>
      </div>
      {summary !== '' ? (
        <p className="max-w-4xl text-sm leading-relaxed md:text-[15px]">
          {summary}
        </p>
      ) : null}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {stats.map((s) => (
          <HeaderStat key={s.label} {...s} />
        ))}
        <HeaderStat
          label={GROUP_LABEL[type]}
          value={entity.group ?? '—'}
          rank={
            entity.sub != null && entity.sub !== entity.group
              ? entity.sub
              : undefined
          }
        />
      </div>
    </header>
  );
}

// Headline tiles: population, density, growth and area (whichever the type has), each with the
// place's rank among all places of the type.
function headerStats(dataset: Dataset, index: number) {
  const ids = [-1, -2, growthMetricId(dataset), -5].filter(
    (id): id is number => id != null && dataset.hasValues(id)
  );
  const labels: Record<number, string> = {
    [-1]: 'Population',
    [-2]: 'Density',
    [-3]: 'Growth rate',
    [-4]: 'Growth since 2020',
    [-5]: 'Area',
  };
  const out: { label: string; value: string; rank?: string }[] = [];
  for (const id of ids) {
    const metric = dataset.metric(id);
    const s = standingAt(dataset.numeric(id), index, 1);
    if (metric == null || s == null) continue;
    out.push({
      label: labels[id] ?? metric.label,
      value: formatValue(metric, s.value, { compact: id === -1 }),
      rank: `${s.rank === 1 ? 'Highest' : `${ordinal(s.rank)} highest`} of ${formatInt(s.n)}`,
    });
  }
  return out;
}

/** Small map with this place outlined (dot for cities), coloured by population for context. */
function Locator({ dataset, index }: { dataset: Dataset; index: number }) {
  const navigate = useNavigate();
  const entity = dataset.entities[index];
  const popMetric = dataset.metric(-1);
  const highlight = useMemo(() => [entity.id], [entity.id]);
  return (
    <Card
      title="Where it is"
      subtitle="Shaded by population; select a place to open it"
    >
      <Choropleth
        dataset={dataset}
        values={dataset.numeric(-1)}
        format={(v) => formatValue(popMetric, v, { compact: true })}
        label="Population"
        highlight={highlight}
        height={260}
        onSelect={(i) =>
          void navigate({
            to: '/places/$type/$slug',
            params: { type: dataset.type.id, slug: dataset.entities[i].slug },
          })
        }
      />
    </Card>
  );
}
