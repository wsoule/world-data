import { Check, Share2 } from 'lucide-react';
import { useEffect, useState } from 'react';

import { Button, cx } from '~/components/ui';

type CopyStatus = 'idle' | 'copied' | 'failed';

/**
 * Copies the current URL (which encodes the whole comparison) and confirms it
 * with a small toast. Falls back to a hint when the clipboard is unavailable.
 */
export function ShareButton() {
  const [status, setStatus] = useState<CopyStatus>('idle');

  useEffect(() => {
    if (status === 'idle') return;
    const t = window.setTimeout(() => setStatus('idle'), 2600);
    return () => window.clearTimeout(t);
  }, [status]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setStatus('copied');
    } catch {
      setStatus('failed');
    }
  };

  return (
    <>
      <Button
        onClick={() => void copy()}
        title="Copy a link to this exact comparison"
      >
        {status === 'copied' ? (
          <Check className="text-good size-4" aria-hidden />
        ) : (
          <Share2 className="size-4" aria-hidden />
        )}
        Share
      </Button>
      <div
        role="status"
        aria-live="polite"
        className={cx(
          'pointer-events-none fixed bottom-6 left-1/2 z-50 -translate-x-1/2 transition-all duration-200',
          status === 'idle'
            ? 'translate-y-2 opacity-0'
            : 'translate-y-0 opacity-100'
        )}
      >
        {status !== 'idle' ? (
          <div className="flex items-center gap-2 rounded-full bg-slate-900 px-4 py-2 text-sm text-white shadow-lg dark:bg-slate-100 dark:text-slate-900">
            {status === 'copied' ? (
              <>
                <Check className="size-4" aria-hidden /> Link copied — anyone
                with it sees this comparison
              </>
            ) : (
              'Couldn’t copy automatically — copy the address bar instead'
            )}
          </div>
        ) : null}
      </div>
    </>
  );
}
