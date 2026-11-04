import { useSuspenseQuery } from '@tanstack/react-query';
import { Suspense, useMemo } from 'react';

import { storiesIndexQuery } from '~/data/api';
import type { TopicFile } from '~/data/types';
import { StoryLinkCard } from '~/features/articles/StoryLinks';
import {
  mayHaveStories,
  storiesForTopic,
} from '~/features/articles/storyPicks';

interface TopicStoriesProps {
  topic: Pick<TopicFile, 'type' | 'metrics'>;
  /** The statistic shown on the map, or null on a page without numbers */
  focusId: number | null;
}

/**
 * "Data stories using this statistic": the data stories that chart one of this topic's
 * statistics, those on the focused statistic first. Renders nothing, without loading the stories
 * index, for the many topics no story can use. The topic route's loader does not load the
 * index, so the list sits in its own Suspense boundary: the server streams it into the HTML once
 * the index is read instead of holding back the whole page behind the root spinner.
 */
export function TopicStories(props: TopicStoriesProps) {
  if (!mayHaveStories(props.topic.metrics)) return null;
  return (
    <Suspense fallback={null}>
      <TopicStoryList {...props} />
    </Suspense>
  );
}

function TopicStoryList({ topic, focusId }: TopicStoriesProps) {
  const { data: stories } = useSuspenseQuery(storiesIndexQuery);
  const { stories: list, focusOnly } = useMemo(
    () => storiesForTopic(stories, topic.type, topic.metrics, focusId),
    [stories, topic, focusId]
  );
  if (list.length === 0) return null;
  return (
    <StoryLinkCard
      title={
        focusOnly
          ? 'Data stories using this statistic'
          : 'Data stories using statistics on this page'
      }
      subtitle={
        focusOnly
          ? 'Each charts this statistic against another and explains how the two move together.'
          : 'Each charts a statistic from this page against another and explains how the two move together.'
      }
      stories={list}
    />
  );
}
