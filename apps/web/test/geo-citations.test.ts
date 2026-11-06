import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  fromAnthropic,
  fromOpenAI,
  fromPerplexity,
  onHost,
  parseQuestions,
  pathOf,
} from '../scripts/lib/citations';

describe('citation tracker', () => {
  test('reads every question in docs/geo.md, numbered in order', () => {
    const qs = parseQuestions(
      readFileSync(join(import.meta.dir, '../../../docs/geo.md'), 'utf8')
    );
    expect(qs.length).toBe(20);
    expect(qs.map((q) => q.n)).toEqual(qs.map((_, i) => i + 1));
    for (const q of qs)
      expect(q.target).toMatch(/^\/(topics|articles|places)\//);
  });

  test('Perplexity: citations, or search_results when they are absent', () => {
    const msg = { choices: [{ message: { content: 'DC is highest.' } }] };
    expect(
      fromPerplexity({
        ...msg,
        citations: ['https://a.com/x', 'https://a.com/x'],
      })
    ).toEqual({ text: 'DC is highest.', cited: ['https://a.com/x'] });
    expect(
      fromPerplexity({ ...msg, search_results: [{ url: 'https://b.com/' }] })
        .cited
    ).toEqual(['https://b.com/']);
  });

  test('OpenAI: url_citation annotations on output_text parts', () => {
    const body = {
      output: [
        { type: 'web_search_call', status: 'completed' },
        {
          type: 'message',
          content: [
            {
              type: 'output_text',
              text: 'Maryland ranks high.',
              annotations: [
                {
                  type: 'url_citation',
                  url: 'https://rankodex.com/topics/state/x',
                },
                { type: 'file_citation', file_id: 'f' },
              ],
            },
          ],
        },
      ],
    };
    expect(fromOpenAI(body)).toEqual({
      text: 'Maryland ranks high.',
      cited: ['https://rankodex.com/topics/state/x'],
    });
  });

  test('Anthropic: only search results a text block cites', () => {
    const body = {
      content: [
        {
          type: 'web_search_tool_result',
          content: [
            { type: 'web_search_result', url: 'https://read-only.com/' },
          ],
        },
        {
          type: 'text',
          text: 'Mississippi is lowest.',
          citations: [
            {
              type: 'web_search_result_location',
              url: 'https://www.rankodex.com/a/',
            },
          ],
        },
      ],
    };
    expect(fromAnthropic(body)).toEqual({
      text: 'Mississippi is lowest.',
      cited: ['https://www.rankodex.com/a/'],
    });
  });

  test('matches the host and its subdomains, and compares paths without a trailing slash', () => {
    expect(onHost('https://www.rankodex.com/a', 'rankodex.com')).toBe(true);
    expect(onHost('https://notrankodex.com/a', 'rankodex.com')).toBe(false);
    expect(onHost('not a url', 'rankodex.com')).toBe(false);
    expect(pathOf('https://rankodex.com/topics/state/x/')).toBe(
      '/topics/state/x'
    );
  });
});
