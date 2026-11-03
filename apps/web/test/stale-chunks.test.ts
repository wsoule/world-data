import { afterEach, beforeEach, describe, expect, test } from 'bun:test';

import { importFresh, isStaleChunkError } from '../src/lib/staleChunks';

const missing = new TypeError(
  'Failed to fetch dynamically imported module: https://x/assets/states-10m-OLD.js'
);

/** The value a promise rejects with, or undefined when it resolves. */
async function rejection(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  return undefined;
}

let reloads = 0;
const store = new Map<string, string>();

beforeEach(() => {
  reloads = 0;
  store.clear();
  Object.assign(globalThis, {
    sessionStorage: {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => store.set(k, v),
    },
    window: { location: { reload: () => reloads++ } },
  });
});

afterEach(() => {
  Reflect.deleteProperty(globalThis, 'sessionStorage');
  Reflect.deleteProperty(globalThis, 'window');
});

describe('isStaleChunkError', () => {
  test('recognises missing-chunk messages from Chrome, Firefox and Safari', () => {
    expect(isStaleChunkError(missing)).toBe(true);
    expect(
      isStaleChunkError(new Error('error loading dynamically imported module'))
    ).toBe(true);
    expect(
      isStaleChunkError(new Error('Importing a module script failed.'))
    ).toBe(true);
    expect(
      isStaleChunkError(new Error('Failed to load state/values.json (503)'))
    ).toBe(false);
  });
});

describe('importFresh', () => {
  test('returns the module when the import works', async () => {
    expect(await importFresh(async () => 42)).toBe(42);
    expect(reloads).toBe(0);
  });

  test('reloads once for a missing chunk and leaves the promise pending', async () => {
    const pending = importFresh(() => Promise.reject(missing));
    const settled = await Promise.race([
      pending.then(
        () => 'settled',
        () => 'settled'
      ),
      new Promise((resolve) => setTimeout(() => resolve('pending'), 20)),
    ]);
    expect(settled).toBe('pending');
    expect(reloads).toBe(1);
  });

  test('throws instead of reloading again when the same chunk fails twice', async () => {
    void importFresh(() => Promise.reject(missing));
    await Promise.resolve();
    expect(await rejection(importFresh(() => Promise.reject(missing)))).toBe(
      missing
    );
    expect(reloads).toBe(1);
  });

  test('throws other errors without reloading', async () => {
    const other = new Error('boom');
    expect(await rejection(importFresh(() => Promise.reject(other)))).toBe(
      other
    );
    expect(reloads).toBe(0);
  });
});
