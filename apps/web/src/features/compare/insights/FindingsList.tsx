import { Link } from '@tanstack/react-router';
import { strength } from '@world-data/stats';
import {
  ArrowRight,
  Crosshair,
  Info,
  Lightbulb,
  TrendingDown,
  TrendingUp,
  TriangleAlert,
  Trophy,
  Unlink,
} from 'lucide-react';
import type { ReactNode } from 'react';

import type { CompareSearch } from '../state';
import { type CorrelationMethod, formatP, formatR } from './correlation';
import type { Finding, PlaceTally } from './findings';
import { placeNoun } from './shared';
import type { BasketColumns } from './useBasket';
import { Flag } from '~/components/Flag';
import { cx } from '~/components/ui';
import type { Dataset } from '~/data/dataset';
import { isRankColumn, readsBackwards } from '~/data/rankOrder';
import type { Metric } from '~/data/types';
import { formatValue, plural } from '~/lib/format';

interface FindingsListProps {
  dataset: Dataset;
  search: CompareSearch;
  basket: BasketColumns;
  findings: readonly Finding[];
  method: CorrelationMethod;
}

/** Ranked, plain-English findings with a "Show me" link each, plus one causation caveat. */
export function FindingsList(props: FindingsListProps) {
  const { findings, basket, dataset } = props;
  const noun = placeNoun(dataset.type.id);
  return (
    <div>
      {findings.length === 0 ? (
        <p className="text-muted text-sm">
          Nothing stands out yet. Add a few more metrics with good coverage to
          see relationships and standouts.
        </p>
      ) : (
        <ol className="-my-2 divide-y divide-(--border)">
          {findings.map((f, i) => (
            <FindingRow key={findingKey(f, i)} finding={f} {...props} />
          ))}
        </ol>
      )}
      <p className="bg-surface-2 text-muted mt-4 flex gap-2 rounded-lg px-3 py-2 text-xs leading-relaxed">
        <Lightbulb className="mt-0.5 size-3.5 shrink-0" aria-hidden />
        <span>
          <strong className="text-app font-medium">
            Correlation is not causation.
          </strong>{' '}
          These findings describe how the numbers line up across{' '}
          {plural(basket.rows.length, noun.one, noun.many)}. They do not show
          that one thing drives another; size, region or an unmeasured factor
          can move both.
        </span>
      </p>
    </div>
  );
}

function findingKey(f: Finding, i: number): string {
  switch (f.kind) {
    case 'together':
    case 'unrelated':
      return `${f.kind}-${f.pair.a}-${f.pair.b}`;
    case 'outlier':
      return `outlier-${f.pair.a}-${f.pair.b}-${f.place}`;
    default:
      return `${f.kind}-${i}`;
  }
}

const TONES = {
  up: 'bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300',
  down: 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300',
  muted: 'bg-surface-2 text-muted',
  good: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
  bad: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
  accent:
    'bg-accent-100 text-accent-700 dark:bg-accent-900/50 dark:text-accent-200',
} as const;

interface Rendered {
  icon: typeof Info;
  tone: keyof typeof TONES;
  title: ReactNode;
  detail: ReactNode;
  show?: { search: CompareSearch; label: string };
}

function FindingRow({
  finding,
  ...props
}: FindingsListProps & { finding: Finding }) {
  const r = renderFinding(finding, props);
  const Icon = r.icon;
  return (
    <li className="flex gap-3 py-3">
      <span
        className={cx(
          'grid size-8 shrink-0 place-items-center rounded-lg',
          TONES[r.tone]
        )}
        aria-hidden
      >
        <Icon className="size-4" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm leading-snug">{r.title}</p>
        <p className="text-muted tabular mt-0.5 text-xs leading-relaxed">
          {r.detail}
        </p>
        {r.show != null ? (
          <ShowMe show={r.show} className="-ml-2 inline-flex sm:hidden" />
        ) : null}
      </div>
      {r.show != null ? (
        <ShowMe show={r.show} className="hidden sm:inline-flex" />
      ) : null}
    </li>
  );
}

/** "Show me" link that opens the view (and selection) a finding is about. */
function ShowMe({
  show,
  className,
}: {
  show: NonNullable<Rendered['show']>;
  className: string;
}) {
  return (
    <Link
      to="/compare"
      search={show.search}
      aria-label={show.label}
      className={cx(
        'text-accent-700 hover:bg-accent-50 dark:text-accent-300 dark:hover:bg-accent-900/40 h-7 shrink-0 items-center gap-1 self-start rounded-md px-2 text-xs font-medium whitespace-nowrap',
        className
      )}
    >
      Show me
      <ArrowRight className="size-3.5" aria-hidden />
    </Link>
  );
}

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function M({ children }: { children: ReactNode }) {
  return <strong className="text-app font-semibold">{children}</strong>;
}

/**
 * "higher Median Household Income" / "a better Best Education Rank": rank columns are phrased as
 * better/worse by the metric's direction, so neither a best-first list's lower number nor a
 * worst-first list's higher number reads as a bad thing.
 */
function movement(metric: Metric, dir: 1 | -1, up: boolean): ReactNode {
  if (isRankColumn(metric)) {
    const better = up === (dir === 1);
    return (
      <>
        a {better ? 'better' : 'worse'} <M>{metric.label}</M>
      </>
    );
  }
  return (
    <>
      {up ? 'higher' : 'lower'} <M>{metric.label}</M>
    </>
  );
}

function withHighlights(search: CompareSearch, ids: readonly string[]) {
  return [...new Set([...(search.hl ?? []), ...ids])];
}

function renderFinding(f: Finding, props: FindingsListProps): Rendered {
  const { dataset, search, basket, method } = props;
  const noun = placeNoun(dataset.type.id);
  const sym = method === 'pearson' ? 'r' : 'ρ';
  const entityAt = (place: number) => dataset.entities[basket.rows[place]];
  const placeName = (place: number) => {
    const e = entityAt(place);
    return (
      <Link
        to="/places/$type/$slug"
        params={{ type: dataset.type.id, slug: e.slug }}
        className="text-app inline-flex items-baseline gap-1 font-semibold hover:underline"
      >
        <Flag
          entity={e}
          type={dataset.type.id}
          size={14}
          className="self-center"
        />
        {e.name}
      </Link>
    );
  };

  switch (f.kind) {
    case 'together': {
      const A = basket.metrics[f.pair.i];
      const B = basket.metrics[f.pair.j];
      const dirA = basket.directions[f.pair.i];
      const dirB = basket.directions[f.pair.j];
      // Lead with the "good" end of a rank metric ("a better rank"), else with higher values.
      const upA = !readsBackwards(A, dirA);
      const upB = f.sign > 0 ? upA : !upA;
      const s = strength(f.r);
      return {
        icon: f.sign > 0 ? TrendingUp : TrendingDown,
        tone: f.sign > 0 ? 'up' : 'down',
        title: (
          <>
            {capitalize(noun.many)} with {movement(A, dirA, upA)} tend to have{' '}
            {movement(B, dirB, upB)}.
          </>
        ),
        detail: `${capitalize(s)} ${f.sign > 0 ? 'positive' : 'negative'} correlation · ${sym} = ${formatR(f.r)} · n = ${f.n} · ${formatP(f.p)}`,
        show: {
          search: { ...search, view: 'scatter', x: A.id, y: B.id },
          label: `Plot ${A.label} against ${B.label}`,
        },
      };
    }
    case 'unrelated': {
      const A = basket.metrics[f.pair.i];
      const B = basket.metrics[f.pair.j];
      return {
        icon: Unlink,
        tone: 'muted',
        title: (
          <>
            <M>{A.label}</M> and <M>{B.label}</M> show no clear relationship.
          </>
        ),
        detail: `${sym} = ${formatR(f.r)} across ${plural(f.n, noun.one, noun.many)}; knowing one tells you little about the other.`,
        show: {
          search: { ...search, view: 'scatter', x: A.id, y: B.id },
          label: `Plot ${A.label} against ${B.label}`,
        },
      };
    }
    case 'leaders':
    case 'laggards': {
      const lead = f.places[0];
      const others = f.places.slice(1);
      const ids = f.places.map((t) => entityAt(t.place).id);
      const where = f.kind === 'leaders' ? 'top' : 'bottom';
      // Neutral metrics (population, area…) never count; say so when some were left out.
      const skipped = basket.neutral.some((n) => n);
      return {
        icon: f.kind === 'leaders' ? Trophy : TriangleAlert,
        tone: f.kind === 'leaders' ? 'good' : 'bad',
        title: (
          <>
            {placeName(lead.place)} is in the {where} 10% on {lead.count} of{' '}
            {skipped
              ? `the ${f.metricCount} metrics with a better side`
              : `${f.metricCount} metrics`}
            .
          </>
        ),
        detail: (
          <>
            {metricList(basket, lead)}
            {others.length > 0 ? (
              <>
                {' '}
                Also often in the {where} 10%:{' '}
                {others
                  .map((t) => `${entityAt(t.place).name} (${t.count})`)
                  .join(', ')}
                .
              </>
            ) : null}
          </>
        ),
        show: {
          search: {
            ...search,
            view: 'parallel',
            hl: withHighlights(search, ids),
          },
          label: `Highlight these ${noun.many} on the rank lines`,
        },
      };
    }
    case 'outlier': {
      const A = basket.metrics[f.pair.i];
      const B = basket.metrics[f.pair.j];
      const e = entityAt(f.place);
      const va = basket.columns[f.pair.i][f.place];
      const vb = basket.columns[f.pair.j][f.place];
      return {
        icon: Crosshair,
        tone: 'accent',
        title: (
          <>
            {placeName(f.place)} stands apart from the <M>{A.label}</M> –{' '}
            <M>{B.label}</M> pattern.
          </>
        ),
        detail: `Its ${B.label} (${formatValue(B, vb)}) is ${f.z > 0 ? 'well above' : 'well below'} the trend line for its ${A.label} (${formatValue(A, va)}): ${f.z > 0 ? '+' : '−'}${Math.abs(f.z).toFixed(1)} SD. Trend r = ${formatR(f.r)}, n = ${f.n}.`,
        show: {
          search: {
            ...search,
            view: 'scatter',
            x: A.id,
            y: B.id,
            hl: withHighlights(search, [e.id]),
          },
          label: `Plot ${A.label} against ${B.label} with ${e.name} highlighted`,
        },
      };
    }
    case 'no-signal':
      return {
        icon: Info,
        tone: 'muted',
        title: <>None of these metrics move together reliably.</>,
        detail: `No pair reaches |${sym}| ≥ 0.3 with p < 0.05 across these ${noun.many}.`,
      };
  }
}

function metricList(basket: BasketColumns, tally: PlaceTally): string {
  const labels = tally.metricIds
    .map((id) => basket.metrics.find((m) => m.id === id)?.label)
    .filter((l) => l != null);
  return `${labels.join(', ')}.`;
}
