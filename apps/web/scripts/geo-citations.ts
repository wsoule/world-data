// AI citation tracker: asks the questions in docs/geo.md through the APIs behind AI search
// (Perplexity Sonar, OpenAI's Responses API with web search, Anthropic's Messages API with web
// search) and records whether each answer cites rankodex.com, and which page.
//
//   bun scripts/geo-citations.ts              # every engine with a key set
//   bun scripts/geo-citations.ts --only 1,4   # some questions
//   bun scripts/geo-citations.ts --dry-run    # list the questions and engines, call nothing
//
// Keys come from the environment and are never written anywhere:
//   PERPLEXITY_API_KEY   (model: PERPLEXITY_MODEL, default sonar)
//   OPENAI_API_KEY       (model: OPENAI_MODEL, default gpt-5-mini)
//   ANTHROPIC_API_KEY    (model: ANTHROPIC_MODEL, default claude-sonnet-5-5)
// An engine without a key is skipped, so with none set this only prints what it would do.
//
// Each run appends one row per engine and question to .cache/geo/citations.csv (gitignored), so
// runs a few weeks apart can be compared, and prints a summary. API answers are close to, not
// the same as, what the consumer apps show; they move together, which is what the trend needs.

import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

import {
  type EngineAnswer,
  fromAnthropic,
  fromOpenAI,
  fromPerplexity,
  onHost,
  parseQuestions,
  pathOf,
} from './lib/citations';

const HOST = 'rankodex.com';
const ROOT = path.resolve(import.meta.dir, '../../..');
const OUT = path.resolve(import.meta.dir, '../.cache/geo/citations.csv');

const args = process.argv.slice(2);
const DRY = args.includes('--dry-run');
const onlyArg = args[args.indexOf('--only') + 1];
const only =
  args.includes('--only') && onlyArg != null
    ? new Set(onlyArg.split(',').map(Number))
    : null;

interface Engine {
  id: string;
  key: string;
  model: string;
  ask: (question: string, key: string, model: string) => Promise<EngineAnswer>;
}

/** POSTs JSON and returns the parsed body, throwing with the API's message on an error status. */
async function post(
  url: string,
  headers: Record<string, string>,
  body: unknown
): Promise<Record<string, unknown>> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(120_000),
  });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok)
    throw new Error(
      `${res.status} ${JSON.stringify(json.error ?? json).slice(0, 200)}`
    );
  return json;
}

const ENGINES: Engine[] = [
  {
    id: 'perplexity',
    key: 'PERPLEXITY_API_KEY',
    model: process.env.PERPLEXITY_MODEL ?? 'sonar',
    ask: async (q, key, model) =>
      fromPerplexity(
        await post(
          'https://api.perplexity.ai/chat/completions',
          { authorization: `Bearer ${key}` },
          { model, messages: [{ role: 'user', content: q }] }
        )
      ),
  },
  {
    id: 'openai',
    key: 'OPENAI_API_KEY',
    model: process.env.OPENAI_MODEL ?? 'gpt-5-mini',
    ask: async (q, key, model) =>
      fromOpenAI(
        await post(
          'https://api.openai.com/v1/responses',
          { authorization: `Bearer ${key}` },
          { model, input: q, tools: [{ type: 'web_search' }] }
        )
      ),
  },
  {
    id: 'anthropic',
    key: 'ANTHROPIC_API_KEY',
    model: process.env.ANTHROPIC_MODEL ?? 'claude-sonnet-5-5',
    ask: async (q, key, model) =>
      fromAnthropic(
        await post(
          'https://api.anthropic.com/v1/messages',
          { 'x-api-key': key, 'anthropic-version': '2023-06-01' },
          {
            model,
            max_tokens: 1500,
            messages: [{ role: 'user', content: q }],
            tools: [
              {
                type:
                  process.env.ANTHROPIC_WEB_SEARCH_TOOL ??
                  'web_search_20250305',
                name: 'web_search',
                max_uses: 3,
              },
            ],
          }
        )
      ),
  },
];

const csv = (v: string | number | boolean) => {
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

const questions = parseQuestions(
  readFileSync(path.join(ROOT, 'docs/geo.md'), 'utf8')
).filter((q) => only == null || only.has(q.n));
const ready = ENGINES.filter((e) => (process.env[e.key] ?? '') !== '');

console.log(`${questions.length} questions from docs/geo.md`);
for (const e of ENGINES)
  console.log(
    `  ${e.id.padEnd(11)} ${ready.includes(e) ? `on (${e.model})` : `skipped: set ${e.key}`}`
  );
if (DRY || ready.length === 0) {
  if (ready.length === 0)
    console.log('\nNo API keys set, so nothing was asked. See docs/geo.md.');
  for (const q of questions)
    console.log(`  ${q.n}. ${q.question}  →  ${q.target}`);
  process.exit(0);
}

mkdirSync(path.dirname(OUT), { recursive: true });
if (!existsSync(OUT))
  appendFileSync(
    OUT,
    'date,engine,model,n,question,target,cited,target_cited,rankodex_urls,mentioned,citations,top_domains\n'
  );

const date = new Date().toISOString().slice(0, 10);
const tally = new Map<
  string,
  { asked: number; cited: number; target: number }
>();
for (const e of ready) {
  const t = { asked: 0, cited: 0, target: 0 };
  tally.set(e.id, t);
  for (const q of questions) {
    let answer: EngineAnswer;
    try {
      answer = await e.ask(q.question, process.env[e.key] ?? '', e.model);
    } catch (err) {
      console.log(`  ${e.id} #${q.n} failed: ${(err as Error).message}`);
      continue;
    }
    const ours = answer.cited.filter((u) => onHost(u, HOST));
    const hitTarget = ours.some((u) => pathOf(u) === q.target);
    const domains = [
      ...new Set(
        answer.cited.flatMap((u) => {
          try {
            return [new URL(u).hostname.replace(/^www\./, '')];
          } catch {
            return [];
          }
        })
      ),
    ].slice(0, 5);
    t.asked++;
    if (ours.length > 0) t.cited++;
    if (hitTarget) t.target++;
    appendFileSync(
      OUT,
      `${[
        date,
        e.id,
        e.model,
        q.n,
        q.question,
        q.target,
        ours.length > 0,
        hitTarget,
        ours.map(pathOf).join(' '),
        /rankodex/i.test(answer.text),
        answer.cited.length,
        domains.join(' '),
      ]
        .map(csv)
        .join(',')}\n`
    );
    console.log(
      `  ${e.id} #${q.n} ${ours.length > 0 ? `CITED ${ours.map(pathOf).join(' ')}` : `not cited (${domains.slice(0, 3).join(', ')})`}`
    );
  }
}

console.log('\nCited rankodex.com');
for (const [id, t] of tally)
  console.log(
    `  ${id.padEnd(11)} ${t.cited}/${t.asked} answers, ${t.target} on the target page`
  );
console.log(`\nAppended to ${path.relative(process.cwd(), OUT)}`);
