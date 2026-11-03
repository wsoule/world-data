// Cached downloads for the external sources: fetch a URL into a file once, retrying transient
// failures, and refuse to cache a response that is not what the source should return (an HTML
// error page in place of a zip or CSV), so a bad response never poisons later builds.

import { access, mkdir, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';

/**
 * User agent naming a contact, for government servers that reject anonymous clients (BLS answers
 * 403 unless the user agent carries an email). The address comes from DATA_CONTACT_EMAIL so the
 * repository never ships someone's address; null when it is not set, and such sources skip.
 */
export function contactUserAgent(): string | null {
  const email = process.env.DATA_CONTACT_EMAIL?.trim();
  return email != null && /^[^@\s]+@[^@\s]+$/.test(email)
    ? `Rankodex data builder (+https://rankodex.com; contact: ${email})`
    : null;
}

export async function exists(file: string): Promise<boolean> {
  try {
    await access(file);
    return true;
  } catch {
    return false;
  }
}

/** Leading bytes of a zip archive (also .xlsx). */
export const isZip = (b: Buffer): boolean =>
  b.subarray(0, 2).toString('latin1') === 'PK';

/** True when a text body is HTML, which a data download should never be. */
export const isHtml = (b: Buffer): boolean =>
  /^\s*<(!doctype|html)/i.test(b.subarray(0, 200).toString('latin1'));

/**
 * Downloads `url` to `file` unless it is already there (or `refresh`). `valid` checks the body
 * before it is written. Returns false, with a warning, when the source could not be fetched, so
 * one unreachable source does not stop the others.
 */
export async function cachedDownload(
  url: string,
  file: string,
  opts: {
    refresh?: boolean;
    headers?: Record<string, string>;
    valid?: (body: Buffer) => boolean;
  } = {}
): Promise<boolean> {
  if (opts.refresh !== true && (await exists(file))) return true;
  await mkdir(path.dirname(file), { recursive: true });
  for (let attempt = 0; ; attempt++) {
    try {
      const res = await fetch(url, { headers: opts.headers });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = Buffer.from(await res.arrayBuffer());
      if (opts.valid != null && !opts.valid(body))
        throw new Error('unexpected content (not the data file)');
      await writeFile(`${file}.tmp`, body);
      await rename(`${file}.tmp`, file);
      console.log(`cached ${path.basename(file)}`);
      return true;
    } catch (err) {
      if (attempt >= 3) {
        console.warn(
          `could not fetch ${url}: ${err instanceof Error ? err.message : String(err)}`
        );
        return false;
      }
      await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt));
    }
  }
}
