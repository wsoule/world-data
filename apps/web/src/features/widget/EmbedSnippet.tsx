import { Link } from '@tanstack/react-router';
import { Check, Code2, Copy } from 'lucide-react';
import { useState } from 'react';

import { embedSnippet } from './embed';
import type { EntityType } from '~/data/types';

/**
 * "Embed this ranking": a collapsed box under a topic's charts with the iframe code for the
 * statistic shown, a copy button, and a link to /embed for options and white-label embeds. The
 * code depends only on the path and the focus metric, so it renders the same on the server.
 */
export function EmbedSnippet({
  type,
  slug,
  metric,
}: {
  type: EntityType;
  slug: string;
  metric: number;
}) {
  const code = embedSnippet(type, slug, metric);
  const [copied, setCopied] = useState(false);
  const copy = () => {
    void navigator.clipboard
      ?.writeText(code)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      })
      .catch(() => {});
  };
  return (
    <details className="card group p-3 text-sm">
      <summary className="text-muted hover:text-app flex cursor-pointer list-none items-center gap-2 font-medium">
        <Code2 className="size-4" aria-hidden />
        Embed this ranking on your site
      </summary>
      <div className="mt-3 space-y-2">
        <textarea
          readOnly
          value={code}
          rows={3}
          aria-label="Embed code"
          onFocus={(e) => e.currentTarget.select()}
          className="border-app bg-surface-2 w-full resize-none rounded-md border p-2 font-mono text-xs"
        />
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={copy}
            className="border-app hover:border-accent-300 inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium"
          >
            {copied ? (
              <Check className="size-3.5" aria-hidden />
            ) : (
              <Copy className="size-3.5" aria-hidden />
            )}
            {copied ? 'Copied' : 'Copy code'}
          </button>
          <span className="text-muted text-xs">
            Free with a credit link.{' '}
            <Link to="/embed" className="underline underline-offset-2">
              Options and white-label embeds
            </Link>
          </span>
        </div>
      </div>
    </details>
  );
}
