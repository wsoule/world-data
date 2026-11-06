// Pure helpers for the AI citation tracker (scripts/geo-citations.ts): the question list from
// docs/geo.md, and each engine's answer reduced to its text and the URLs it cited. Kept apart
// from the network code so tests can feed them recorded responses.

/** One tracked question and the Rankodex page that should answer it. */
export interface TrackedQuestion {
  n: number;
  question: string;
  /** Site path, e.g. "/topics/state/median-household-income-by-state" */
  target: string;
}

/** An engine's answer: its text and every URL it cited, in order, without duplicates. */
export interface EngineAnswer {
  text: string;
  cited: string[];
}

/** The question table in docs/geo.md: rows of `| n | question | /path |`. */
export function parseQuestions(markdown: string): TrackedQuestion[] {
  const out: TrackedQuestion[] = [];
  for (const m of markdown.matchAll(
    /^\|\s*(\d+)\s*\|\s*([^|]+?)\s*\|\s*(\/[^\s|]*)\s*\|\s*$/gm
  ))
    out.push({ n: Number(m[1]), question: m[2], target: m[3] });
  return out;
}

const unique = (urls: string[]) => [...new Set(urls.filter((u) => u !== ''))];

type Json = Record<string, unknown>;
const arr = (v: unknown): Json[] =>
  Array.isArray(v)
    ? (v.filter((x) => x != null && typeof x === 'object') as Json[])
    : [];
const str = (v: unknown): string => (typeof v === 'string' ? v : '');

/**
 * Perplexity chat completions: the answer in choices[0].message.content, cited URLs in
 * `citations` (older responses) or `search_results[].url`.
 */
export function fromPerplexity(body: Json): EngineAnswer {
  const message = arr(body.choices)[0]?.message as Json | undefined;
  const citations = Array.isArray(body.citations)
    ? body.citations.map(str)
    : arr(body.search_results).map((r) => str(r.url));
  return { text: str(message?.content), cited: unique(citations) };
}

/**
 * OpenAI Responses API with the web_search tool: message items in `output` hold output_text
 * parts whose `annotations` include url_citation entries.
 */
export function fromOpenAI(body: Json): EngineAnswer {
  let text = '';
  const cited: string[] = [];
  for (const item of arr(body.output)) {
    if (item.type !== 'message') continue;
    for (const part of arr(item.content)) {
      text += str(part.text);
      for (const a of arr(part.annotations))
        if (a.type === 'url_citation') cited.push(str(a.url));
    }
  }
  return { text, cited: unique(cited) };
}

/**
 * Anthropic Messages API with the web_search tool: text blocks carry `citations` pointing at
 * search results (web_search_result_location). Results the model read but did not cite are
 * not counted.
 */
export function fromAnthropic(body: Json): EngineAnswer {
  let text = '';
  const cited: string[] = [];
  for (const block of arr(body.content)) {
    if (block.type !== 'text') continue;
    text += str(block.text);
    for (const c of arr(block.citations)) cited.push(str(c.url));
  }
  return { text, cited: unique(cited) };
}

/** Whether `url` is on `host` or one of its subdomains. */
export function onHost(url: string, host: string): boolean {
  try {
    const h = new URL(url).hostname.toLowerCase();
    return h === host || h.endsWith(`.${host}`);
  } catch {
    return false;
  }
}

/** A URL's path without a trailing slash, for comparing with a target path. */
export function pathOf(url: string): string {
  try {
    return new URL(url).pathname.replace(/(.)\/$/, '$1');
  } catch {
    return '';
  }
}
