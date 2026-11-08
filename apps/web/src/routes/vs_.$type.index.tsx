import { createFileRoute, Link, notFound } from '@tanstack/react-router';

import { notFoundHead } from '~/components/feedback';
import { Flag } from '~/components/Flag';
import { Card, PageHeader } from '~/components/ui';
import { entitiesQuery, manifestQuery } from '~/data/api';
import { isEntityType } from '~/data/types';
import { pairsQuery } from '~/features/vs/pairData';
import { pairSlug, partnersOf } from '~/features/vs/pairs';
import { formatInt, typeNoun } from '~/lib/format';
import { breadcrumbs, pageHead } from '~/lib/seo';
import { SITE } from '~/site';

export interface HubPlace {
  name: string;
  slug: string;
  flag: string | null;
  partners: { name: string; pair: string }[];
}

// Every matchup page of one place type, grouped by place (largest first), so each is a link
// away from the sitemap's hubs and from the /vs tool.
export const Route = createFileRoute('/vs_/$type/')({
  loader: async ({ context, params }) => {
    const type = params.type;
    if (!isEntityType(type)) throw notFound();
    const qc = context.queryClient;
    const [pairs, entities, manifest] = await Promise.all([
      qc.ensureQueryData(pairsQuery),
      qc.ensureQueryData(entitiesQuery(type)),
      qc.ensureQueryData(manifestQuery),
    ]);
    const count = pairs[type]?.length ?? 0;
    if (count === 0) throw notFound();
    const names = new Map(entities.map((e) => [e.slug, e.name]));
    const places: HubPlace[] = [];
    for (const e of entities) {
      const partners = partnersOf(pairs, type, e.slug)
        .filter((p) => names.has(p))
        .map((p) => ({ name: names.get(p) ?? p, pair: pairSlug(e.slug, p) }));
      if (partners.length > 0)
        places.push({ name: e.name, slug: e.slug, flag: e.flag, partners });
    }
    const label = manifest.types.find((t) => t.id === type)?.label ?? 'Places';
    return { type, label, count, places };
  },
  head: ({ loaderData, params }) =>
    loaderData == null
      ? notFoundHead()
      : pageHead({
          title: `${loaderData.label} compared head to head`,
          description: `${formatInt(loaderData.count)} side-by-side comparisons of ${typeNoun(loaderData.label)}: who ranks better on every statistic both have, category by category.`,
          path: `/vs/${params.type}`,
          jsonLd: [
            breadcrumbs([
              { name: SITE.name, path: '/' },
              { name: 'Head to head', path: '/vs' },
              { name: loaderData.label, path: `/vs/${params.type}` },
            ]),
          ],
        }),
  component: PairHub,
});

function PairHub() {
  const { type, label, count, places } = Route.useLoaderData();
  return (
    <div className="space-y-6">
      <PageHeader
        title={`${label} compared head to head`}
        subtitle={`${formatInt(count)} matchups, each scoring two places on every statistic they share.`}
      />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {places.map((p) => (
          <Card key={p.slug} className="min-w-0">
            <h2 className="flex min-w-0 items-center gap-2 font-medium">
              <Flag entity={p} type={type} size={20} />
              <span className="truncate">{p.name} vs…</span>
            </h2>
            <ul className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-sm">
              {p.partners.map((o) => (
                <li key={o.pair}>
                  <Link
                    to="/vs/$type/$pair"
                    params={{ type, pair: o.pair }}
                    className="text-accent-600 dark:text-accent-300 hover:underline"
                  >
                    {o.name}
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
        ))}
      </div>
    </div>
  );
}
