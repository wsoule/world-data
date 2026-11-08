import { Link } from '@tanstack/react-router';
import { ArrowRight, ChevronRight, Scale } from 'lucide-react';

import type { PairLead, PairPageData, PairPlace, PairRow } from './pairData';
import { averageText } from './pairData';
import { placePalette } from './palette';
import { Flag } from '~/components/Flag';
import { QuickAnswers } from '~/components/QuickAnswers';
import { Card, cx } from '~/components/ui';
import type { EntityType } from '~/data/types';
import { formatInt, plural } from '~/lib/format';
import { useTheme } from '~/lib/theme';

/**
 * A prerendered matchup page (/vs/<type>/<a>-vs-<b>): who wins more statistics, who leads each
 * category, the headline numbers side by side and the biggest gaps, all from `PairPageData`, so
 * it renders on the server without the type's full data. The interactive /vs tool, one click
 * away, lists every shared statistic and lets people add places.
 */
export function PairPage({ data }: { data: PairPageData }) {
  const palette = placePalette(useTheme());
  const { type, places } = data;
  return (
    <div className="space-y-6">
      <Header data={data} />
      <ScoreCard data={data} palette={palette} />
      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-2">
        {data.glance.length > 0 ? (
          <RowsCard
            title="At a glance"
            subtitle={`Headline statistics, each ranked among all ${data.noun}.`}
            rows={data.glance}
            places={places}
            type={type}
            palette={palette}
          />
        ) : null}
        <Leads data={data} palette={palette} />
      </div>
      {data.diffs.length > 0 ? (
        <RowsCard
          title="Biggest differences"
          subtitle={`The ${data.diffs.length} statistics where their rankings differ most, among rankings of at least ${formatInt(data.minN)} ${data.noun}.`}
          rows={data.diffs}
          places={places}
          type={type}
          palette={palette}
        />
      ) : null}
      <InteractiveLink data={data} />
      <QuickAnswers items={data.seo.faq} />
      {data.related.length > 0 ? (
        <Card
          title="More matchups"
          subtitle={`Other comparisons with ${places[0].name} or ${places[1].name}.`}
        >
          <ul className="grid grid-cols-1 gap-x-6 gap-y-1.5 text-sm sm:grid-cols-2 lg:grid-cols-3">
            {data.related.map((r) => (
              <li key={r.pair} className="min-w-0">
                <Link
                  to="/vs/$type/$pair"
                  params={{ type, pair: r.pair }}
                  className="hover:text-accent-600 dark:hover:text-accent-300 block truncate hover:underline"
                >
                  {r.names[0]} vs {r.names[1]}
                </Link>
              </li>
            ))}
          </ul>
          <Link
            to="/vs/$type"
            params={{ type }}
            className="text-accent-600 dark:text-accent-300 mt-3 inline-block text-xs font-medium hover:underline"
          >
            All {data.noun} matchups
          </Link>
        </Card>
      ) : null}
    </div>
  );
}

function Header({ data }: { data: PairPageData }) {
  const { type, places } = data;
  return (
    <header className="space-y-4">
      <nav
        aria-label="Breadcrumb"
        className="text-muted flex min-w-0 items-center gap-1 text-xs"
      >
        <Link
          to="/vs"
          search={{ type, e: [] }}
          className="hover:text-app shrink-0"
        >
          Head to head
        </Link>
        <ChevronRight className="size-3 shrink-0" aria-hidden />
        <Link
          to="/vs/$type"
          params={{ type }}
          className="hover:text-app shrink-0"
        >
          {data.seo.crumbs[2]?.name}
        </Link>
        <ChevronRight className="size-3 shrink-0" aria-hidden />
        <span className="text-app truncate">
          {places[0].name} vs {places[1].name}
        </span>
      </nav>
      <div className="flex items-center gap-3">
        <span className="flex shrink-0 -space-x-2">
          {places.map((p) => (
            <Flag
              key={p.id}
              entity={p}
              type={type}
              size={40}
              className="ring-surface rounded-md shadow-sm ring-2"
            />
          ))}
        </span>
        <h1 className="min-w-0 text-2xl font-semibold tracking-tight text-balance md:text-3xl">
          {places[0].name} vs {places[1].name}
        </h1>
      </div>
      <p className="text-muted max-w-3xl text-sm leading-relaxed md:text-base">
        {data.seo.summary}
      </p>
    </header>
  );
}

/** Who wins more statistics: a split bar and each place's wins, average and categories led. */
function ScoreCard({
  data,
  palette,
}: {
  data: PairPageData;
  palette: readonly string[];
}) {
  const { score, places, type } = data;
  const led = [0, 1].map(
    (k) => data.leads.filter((l) => l.leader === k).length
  );
  return (
    <Card>
      <h2 className="text-lg font-semibold tracking-tight">
        {score.total === 0
          ? 'No statistics with a better end in common'
          : `${plural(score.total, 'statistic')} with a better end, compared`}
      </h2>
      <p className="text-muted mt-0.5 text-sm">
        Each counts once for the place that ranks better
        {score.ties > 0 ? `; ${plural(score.ties, 'tie')}` : ''}. Totals that
        mostly track population are left out.
      </p>
      {score.total > 0 ? (
        <div
          className="bg-surface-2 mt-4 flex h-3 overflow-hidden rounded-full"
          role="img"
          aria-label={`${places[0].name} ${score.wins[0]}, ${places[1].name} ${score.wins[1]}${score.ties > 0 ? `, ties ${score.ties}` : ''}`}
        >
          {places.map((p, k) => (
            <div
              key={p.id}
              style={{
                width: `${(score.wins[k] / score.total) * 100}%`,
                backgroundColor: palette[k],
              }}
            />
          ))}
          {score.ties > 0 ? (
            <div
              className="bg-slate-300 dark:bg-slate-600"
              style={{ width: `${(score.ties / score.total) * 100}%` }}
            />
          ) : null}
        </div>
      ) : null}
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {places.map((p, k) => (
          <div
            key={p.id}
            className="border-app rounded-xl border p-3"
            style={{ borderTopColor: palette[k], borderTopWidth: 3 }}
          >
            <div className="flex min-w-0 items-center gap-2">
              <Flag entity={p} type={type} size={22} />
              <Link
                to="/places/$type/$slug"
                params={{ type, slug: p.slug }}
                className="hover:text-accent-600 dark:hover:text-accent-300 truncate font-medium"
              >
                {p.name}
              </Link>
            </div>
            <dl className="mt-2 grid grid-cols-3 gap-2">
              <div>
                <dt className="text-muted text-[11px]">Wins</dt>
                <dd className="tabular text-xl font-semibold">
                  {formatInt(score.wins[k])}
                </dd>
              </div>
              <div>
                <dt className="text-muted text-[11px]">Avg. percentile</dt>
                <dd className="tabular text-xl font-semibold">
                  {averageText(data.averages[k])}
                </dd>
              </div>
              <div>
                <dt className="text-muted text-[11px]">Categories led</dt>
                <dd className="tabular text-xl font-semibold">
                  {formatInt(led[k])}
                </dd>
              </div>
            </dl>
          </div>
        ))}
      </div>
    </Card>
  );
}

/**
 * Statistics side by side: label (linked to its topic) over one value column per place, the
 * better value bold in its place's colour. Three columns only, so it fits a phone.
 */
function RowsCard({
  title,
  subtitle,
  rows,
  places,
  type,
  palette,
}: {
  title: string;
  subtitle: string;
  rows: readonly PairRow[];
  places: readonly [PairPlace, PairPlace];
  type: EntityType;
  palette: readonly string[];
}) {
  return (
    <Card title={title} subtitle={subtitle} className="min-w-0">
      <div className="-mx-4 -mb-4">
        <table className="w-full table-fixed border-separate border-spacing-0 text-sm">
          <colgroup>
            <col />
            <col className="w-[6.5rem] sm:w-[8.5rem]" />
            <col className="w-[6.5rem] sm:w-[8.5rem]" />
          </colgroup>
          <thead>
            <tr>
              <th
                scope="col"
                className="border-app bg-surface-2 text-muted border-y px-3 py-2 text-left text-xs font-medium"
              >
                Statistic
              </th>
              {places.map((p, k) => (
                <th
                  key={p.id}
                  scope="col"
                  className="border-app bg-surface-2 text-muted border-y px-3 py-2 text-right text-xs font-medium"
                >
                  <span className="inline-flex max-w-full items-center gap-1.5">
                    <span
                      className="size-2 shrink-0 rounded-full"
                      style={{ backgroundColor: palette[k] }}
                      aria-hidden
                    />
                    <span className="truncate">{p.name}</span>
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <th
                  scope="row"
                  className="border-app border-b px-3 py-2 text-left font-normal"
                >
                  {r.topic != null ? (
                    <Link
                      to="/topics/$type/$slug"
                      params={{ type, slug: r.topic }}
                      className="hover:text-accent-600 dark:hover:text-accent-300 block text-sm break-words hover:underline"
                    >
                      {r.label}
                    </Link>
                  ) : (
                    <span className="block text-sm break-words">{r.label}</span>
                  )}
                  {r.context != null ? (
                    <span className="text-muted block truncate text-xs">
                      {r.context}
                    </span>
                  ) : null}
                </th>
                {([0, 1] as const).map((k) => (
                  <td
                    key={k}
                    className="border-app border-b px-3 py-2 text-right align-top"
                  >
                    <div
                      className={cx(
                        'tabular text-sm break-words',
                        r.winner === k && 'font-semibold'
                      )}
                      style={r.winner === k ? { color: palette[k] } : undefined}
                    >
                      {r.values[k]}
                    </div>
                    <div className="tabular text-muted text-xs">
                      {r.ranks[k]}
                    </div>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

/** Average percentile per category, the leader named and both bars drawn. */
function Leads({
  data,
  palette,
}: {
  data: PairPageData;
  palette: readonly string[];
}) {
  const { places } = data;
  if (data.leads.length === 0) return null;
  return (
    <Card
      title="By category"
      subtitle="Average percentile on each category's widely ranked statistics."
      className="min-w-0"
    >
      <ul className="space-y-2">
        {data.leads.map((l: PairLead) => (
          <li key={l.category}>
            <div className="flex items-baseline justify-between gap-2 text-sm">
              <span className="truncate font-medium">{l.label}</span>
              <span className="text-muted shrink-0 text-xs">
                {l.leader != null ? (
                  <span
                    className="font-medium"
                    style={{ color: palette[l.leader] }}
                  >
                    {places[l.leader].name}
                  </span>
                ) : (
                  'Even'
                )}
                {` · ${plural(l.count, 'statistic')}`}
              </span>
            </div>
            <div className="mt-1 space-y-0.5" aria-hidden>
              {l.means.map((m, k) => (
                <div
                  key={places[k].id}
                  className="bg-surface-2 h-1.5 overflow-hidden rounded-full"
                >
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${Math.max(2, m * 100)}%`,
                      backgroundColor: palette[k],
                      opacity: l.leader === k ? 1 : 0.55,
                    }}
                  />
                </div>
              ))}
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}

/** The way into the interactive tool: every shared statistic, adjustments and more places. */
function InteractiveLink({ data }: { data: PairPageData }) {
  const { type, places } = data;
  return (
    <Link
      to="/vs"
      search={{ type, e: places.map((p) => p.id) }}
      className="card hover:border-accent-400 group flex items-center gap-3 p-4 transition-colors"
    >
      <span className="bg-accent-50 text-accent-700 dark:bg-accent-900/40 dark:text-accent-200 grid size-10 shrink-0 place-items-center rounded-lg">
        <Scale className="size-5" aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-medium">
          See every statistic they share
        </span>
        <span className="text-muted block text-sm">
          Search and sort all of them, adjust for cost of living or population,
          or add up to two more places.
        </span>
      </span>
      <ArrowRight
        className="text-muted group-hover:text-accent-600 size-5 shrink-0"
        aria-hidden
      />
    </Link>
  );
}
