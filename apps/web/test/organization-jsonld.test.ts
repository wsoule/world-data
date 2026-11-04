import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { REPO_URL } from '../src/features/trust/links';
import {
  LOGO_PATH,
  LOGO_SIZE,
  organization,
  ORGANIZATION_ID,
  publisher,
  publisherRef,
  website,
  WEBSITE_ID,
} from '../src/lib/seo';
import { absoluteUrl, SITE } from '../src/site';

const PUBLIC = fileURLToPath(new URL('../public', import.meta.url));

describe('organization structured data', () => {
  test('one Organization with an @id, logo and the repository as sameAs', () => {
    expect(ORGANIZATION_ID).toBe(absoluteUrl('/#organization'));
    expect(organization()).toMatchObject({
      '@type': 'Organization',
      '@id': ORGANIZATION_ID,
      name: SITE.name,
      url: absoluteUrl('/'),
      logo: { url: absoluteUrl(LOGO_PATH), width: 512, height: 512 },
      sameAs: [REPO_URL],
    });
  });

  test('publisher() carries the same @id, and the WebSite points at it', () => {
    expect(publisher()['@id']).toBe(ORGANIZATION_ID);
    expect(publisherRef()).toEqual({ '@id': ORGANIZATION_ID });
    expect(website()).toMatchObject({
      '@type': 'WebSite',
      '@id': WEBSITE_ID,
      url: absoluteUrl('/'),
      publisher: { '@id': ORGANIZATION_ID },
    });
  });

  test('the logo is a 512×512 PNG in public/', () => {
    const png = readFileSync(path.join(PUBLIC, LOGO_PATH));
    expect(png.subarray(1, 4).toString('ascii')).toBe('PNG');
    // IHDR: width and height are the big-endian words at bytes 16 and 20.
    expect(png.readUInt32BE(16)).toBe(LOGO_SIZE);
    expect(png.readUInt32BE(20)).toBe(LOGO_SIZE);
  });
});
