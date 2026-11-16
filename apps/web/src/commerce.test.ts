import { describe, expect, test } from 'bun:test';

import {
  contactHref,
  partnerLink,
  relocationPartners,
  stripeLink,
} from './commerce';

describe('stripeLink', () => {
  test('accepts a Payment Link', () => {
    expect(stripeLink(' https://buy.stripe.com/test_abc123 ')).toBe(
      'https://buy.stripe.com/test_abc123'
    );
  });
  test('rejects anything else', () => {
    expect(stripeLink(undefined)).toBeNull();
    expect(stripeLink('')).toBeNull();
    expect(stripeLink('http://buy.stripe.com/abc')).toBeNull();
    expect(stripeLink('https://buy.stripe.com.evil.com/abc')).toBeNull();
    expect(stripeLink('https://example.com/pay')).toBeNull();
  });
});

describe('partnerLink', () => {
  test('accepts https URLs and rejects the rest', () => {
    expect(partnerLink('https://partner.example.com/?ref=rx')).toBe(
      'https://partner.example.com/?ref=rx'
    );
    expect(partnerLink('http://partner.example.com')).toBeNull();
    expect(partnerLink('javascript:alert(1)')).toBeNull();
    expect(partnerLink('not a url')).toBeNull();
    expect(partnerLink('')).toBeNull();
  });
});

describe('relocationPartners', () => {
  test('lists only configured partners, in display order', () => {
    const partners = relocationPartners({
      movers: 'https://movers.example.com',
      insurance: 'bad',
    });
    expect(partners.map((p) => p.id)).toEqual(['movers']);
    expect(relocationPartners({})).toEqual([]);
  });
});

test('contactHref encodes the subject', () => {
  expect(contactHref('Custom report & index')).toBe(
    'mailto:hello@rankodex.com?subject=Custom%20report%20%26%20index'
  );
});
