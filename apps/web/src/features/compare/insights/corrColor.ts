import { scaleLinear } from 'd3-scale';
import { interpolateRdBu } from 'd3-scale-chromatic';

import type { Theme } from '~/lib/theme';

const LIGHT_STOPS = [-1, -0.5, -0.2, 0, 0.2, 0.5, 1];

/**
 * Diverging colour for a correlation coefficient (−1 red … 0 neutral … +1 blue), tuned per theme
 * so one text colour stays readable on every cell: light mode keeps RdBu inside its mid range
 * (dark text passes 4.5:1 on all stops) with a faint slate centre that still reads on a white
 * card; dark mode runs from deep red through slate to deep blue (light text passes 4.5:1).
 * Returns a d3 scale, which TanStack Charts accepts as a configured colour scale with a fixed
 * domain, and which the HTML legend samples too.
 */
export function correlationColorScale(theme: Theme) {
  if (theme === 'dark')
    return scaleLinear<string>()
      .domain([-1, 0, 1])
      .range(['#9f1239', '#1e293b', '#1d4ed8'])
      .clamp(true);
  return scaleLinear<string>()
    .domain(LIGHT_STOPS)
    .range(
      LIGHT_STOPS.map((r) =>
        r === 0 ? '#eef1f6' : interpolateRdBu(0.5 + 0.3 * r)
      )
    )
    .clamp(true);
}

export type CorrelationColorScale = ReturnType<typeof correlationColorScale>;
