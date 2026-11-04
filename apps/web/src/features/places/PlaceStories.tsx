import { useSuspenseQuery } from '@tanstack/react-query';
import { Suspense, useMemo } from 'react';

import { placeNoun } from './datasetFacts';
import type { PlaceView } from './pageData';
import type { StorySummary } from '~/content/storyTypes';
import { storiesIndexQuery } from '~/data/api';
import { shortLabel } from '~/features/articles/prose';
import { StoryLinkCard } from '~/features/articles/StoryLinks';
import { storiesForPlace, STORY_METRICS } from '~/features/articles/storyPicks';
import { formatValue } from '~/lib/format';

interface PlaceStoriesProps {
  view: PlaceView;
}

/**
 * Whether the place's dot is on a story's chart: the story builder plots every place with both
 * default-year values (and a positive x on a log axis), the same values `numeric()` returns.
 */
function charts(view: PlaceView, s: StorySummary): boolean {
  const x = view.value(s.xId);
  const y = view.value(s.yId);
  return Number.isFinite(x) && Number.isFinite(y) && (!s.logX || x > 0);
}

/**
 * "Data stories that include <place>": a few data stories whose chart has this place on it,
 * each with the place's own two values. Places without any statistic a story can use (world
 * cities, for now) render nothing and never load the stories index. The place route's loader
 * does not load the index, so the list has its own Suspense boundary and the server streams it
 * into the HTML once the index is read, without holding back the rest of the profile.
 */
export function PlaceStories(props: PlaceStoriesProps) {
  const { view } = props;
  const possible = useMemo(
    () => [...STORY_METRICS].some((id) => !Number.isNaN(view.value(id))),
    [view]
  );
  if (!possible) return null;
  return (
    <Suspense fallback={null}>
      <PlaceStoryList {...props} />
    </Suspense>
  );
}

function PlaceStoryList({ view }: PlaceStoriesProps) {
  const { data: stories } = useSuspenseQuery(storiesIndexQuery);
  const { dataset, index } = view;
  const entity = dataset.entities[index];
  const list = useMemo(
    () =>
      storiesForPlace(stories, dataset.type.id, (s) => charts(view, s), index),
    [stories, view, dataset, index]
  );
  if (list.length === 0) return null;
  // "Median Household Income: $62,000 · Price Level: 97.1" for this place.
  // A bare number keeps the label's unit ("Average Temperature (°F): 59.0"); a value that shows
  // its own unit ("38.3%", "$62,000") reads with the short label.
  const value = (label: string, id: number) => {
    const v = formatValue(dataset.metric(id), view.value(id));
    return `${/^[\d.,\s−-]+$/.test(v) ? label : shortLabel(label)}: ${v}`;
  };
  const values = (s: StorySummary) =>
    `${value(s.yLabel, s.yId)} · ${value(s.xLabel, s.xId)}`;
  return (
    <StoryLinkCard
      title={`Data stories that include ${entity.name}`}
      subtitle={`Each story charts two statistics across ${placeNoun(dataset)}, ${entity.name} among them. Its values are under each title.`}
      stories={list}
      detail={values}
    />
  );
}
