# GEO: being cited by AI answer engines

Generative engine optimization is search optimization for ChatGPT search,
Perplexity, Google AI Overviews, Copilot and Claude: they answer a question and
cite the pages they read. Rankodex fits them well (one page per statistic, a
direct answer at the top, sources and dates in the text), so the work is keeping
that true and measuring whether it pays off.

## 1. Technical audit (any time, after big changes)

```bash
cd apps/web
bun scripts/geo-audit.ts                     # live site, about 60 pages
bun scripts/geo-audit.ts --pages 400         # a wider sample
bun scripts/geo-audit.ts --dist              # the local build, before deploying
```

It samples sitemap pages evenly by kind (topics, places, articles, other) and
fails a page with no self-canonical, indexable head, not exactly one `<h1>`, no
lead with a figure, no year or source in the text, missing or broken JSON-LD
(Dataset on topics, Place on places, Article on articles, breadcrumbs), or a
stray `NaN`/`undefined`. It also fetches pages as GPTBot, OAI-SearchBot,
ChatGPT-User, ClaudeBot, Claude-SearchBot, PerplexityBot, Googlebot and Bingbot.
Warnings (long titles or leads) do not fail the run.

Fetching with a bot's user agent cannot show Cloudflare blocks, which check
where real crawlers connect from. For those, open Cloudflare, AI Crawl Control:
every crawler there should show allowed requests and no blocks.

## 2. Are we being cited? (every two weeks)

Ask each question below in ChatGPT (search on), Perplexity, Google (look at the
AI Overview), Copilot and Claude (web search on), in a private window. Record in
a sheet, per engine: cited (a link to rankodex.com), mentioned without a link,
or absent, and which page was cited. The target page is the one that answers
best; a different Rankodex page still counts.

Citations take weeks to start after indexing. Compare runs over months, not day
to day.

| #   | Question                                                             | Target page                                     |
| --- | -------------------------------------------------------------------- | ----------------------------------------------- |
| 1   | Which state has the highest median household income?                 | /topics/state/median-household-income-by-state  |
| 2   | Most educated states in the US                                       | /topics/state/most-educated-states              |
| 3   | Which states have the highest cost of living?                        | /topics/state/cost-of-living-index-by-state     |
| 4   | Is $100k in Michigan worth more than $100k in California?            | /articles/higher-pay-higher-prices              |
| 5   | Which state has the highest rent compared to income?                 | /topics/state/average-rent-by-state             |
| 6   | State obesity rates ranked                                           | /topics/state/obesity-rate-by-state             |
| 7   | Life expectancy by state                                             | /topics/state/life-expectancy-by-state          |
| 8   | Which states have the highest murder rate?                           | /topics/state/murder-rate-by-state              |
| 9   | Do more educated states vote Democratic?                             | /articles/education-and-how-states-vote         |
| 10  | Does education predict how counties vote?                            | /articles/education-and-how-counties-vote       |
| 11  | Is there a link between poverty and murder rates by state?           | /articles/poverty-and-murder-by-state           |
| 12  | Does a country's wealth predict life expectancy?                     | /articles/wealth-and-life-expectancy            |
| 13  | GDP per capita by country ranked                                     | /topics/country/gdp-per-capita-by-country       |
| 14  | Happiest countries in the world                                      | /topics/country/happiest-countries-in-the-world |
| 15  | Unemployment rate by state                                           | /topics/state/unemployment-rate-by-state        |
| 16  | Minimum wage by state                                                | /topics/state/minimum-wage-by-state             |
| 17  | Poverty rate by state                                                | /topics/state/poverty-rate-by-state             |
| 18  | Life expectancy by county                                            | /topics/county/life-expectancy-by-county        |
| 19  | Smoking rates by state                                               | /topics/state/smoking-rates-by-state            |
| 20  | What is the median household income and poverty rate in Mora County? | /places/county/mora-county-nm                   |

Check that every target still answers: `bun scripts/geo-audit.ts` covers the
markup, and this loop covers the links:

```bash
grep -oE '/(topics|articles|places)/[a-z0-9/-]+' docs/geo.md | sort -u |
  while read -r p; do
    printf '%s %s\n' "$(curl -s -o /dev/null -w '%{http_code}' "https://rankodex.com$p")" "$p"
  done
```

## 3. Traffic from AI engines

- **Cloudflare Web Analytics** (when `VITE_CF_ANALYTICS_TOKEN` is set; see the
  README): Referrers shows visits from `chatgpt.com`, `perplexity.ai`,
  `copilot.microsoft.com`, `gemini.google.com` and `claude.ai`.
- **Bing Webmaster Tools**: AI Performance shows Copilot citations, and Bing's
  index also feeds ChatGPT search.
- **Google Search Console**: Performance counts AI Overview appearances with web
  results; watch impressions on topic pages.
- **Cloudflare AI Crawl Control**: which AI crawlers read which pages, and how
  often.
