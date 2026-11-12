import { describe, expect, it } from 'vitest';
import { ftsQuery } from './ideas.js';

describe('ftsQuery', () => {
  it('quotes every word so all are required', () => {
    expect(ftsQuery('react router')).toBe('"react" "router"');
  });

  it('keeps a trailing star as a prefix match', () => {
    expect(ftsQuery('claud*')).toBe('"claud"*');
  });

  // Each of these was an FTS5 syntax error, and a 500, as a raw MATCH string.
  it('takes apostrophes, colons, hyphens and keywords as plain text', () => {
    expect(ftsQuery("don't")).toBe('"don\'t"');
    expect(ftsQuery('title:foo')).toBe('"title:foo"');
    expect(ftsQuery('well-known OR NOT')).toBe('"well-known" "OR" "NOT"');
  });

  it('drops quote characters and empty words', () => {
    expect(ftsQuery('"say "hello""  ')).toBe('"say" "hello"');
    expect(ftsQuery(' * " ')).toBe('');
    expect(ftsQuery(undefined)).toBe('');
  });
});
