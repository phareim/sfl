import { describe, expect, it } from 'vitest';
import { projectBody } from '../src/db/ideas.js';

describe('projectBody', () => {
  it('reads body from notesRow for kind=note', () => {
    expect(projectBody('note', {}, { body: 'hello' })).toBe('hello');
  });

  it('falls back to blob.text for note when no notes row', () => {
    expect(projectBody('note', { text: 'inline' })).toBe('inline');
  });

  it('prefers content_md for page', () => {
    expect(projectBody('page', { content_md: 'md', html_excerpt: 'x', text: 'y' })).toBe('md');
  });

  it('falls through to html_excerpt then text for page', () => {
    expect(projectBody('page', { html_excerpt: 'x', text: 'y' })).toBe('x');
    expect(projectBody('page', { text: 'y' })).toBe('y');
  });

  it('combines text + quoted_text for post/tweet', () => {
    expect(projectBody('post', { text: 'a', quoted_text: 'b' })).toBe('a\nb');
    expect(projectBody('tweet', { text: 'only' })).toBe('only');
    expect(projectBody('tweet', { text: 'a', quoted: { text: 'b' } })).toBe('a\nb');
  });

  it('combines author + description for book', () => {
    expect(projectBody('book', { author: 'foo', description: 'bar' })).toBe('foo\nbar');
    expect(projectBody('book', { description: 'only' })).toBe('only');
  });

  it('returns "" for tag / meta / unknown', () => {
    expect(projectBody('tag', { title: 'x' })).toBe('');
    expect(projectBody('meta', { project: 'x' })).toBe('');
    expect(projectBody('whatever', { anything: 1 })).toBe('');
  });

  it('always returns a string', () => {
    expect(projectBody('note', null)).toBe('');
    expect(projectBody('page', undefined)).toBe('');
  });

  it('truncates at 1 MB', () => {
    const big = 'a'.repeat(2 * 1024 * 1024);
    const out = projectBody('page', { content_md: big });
    expect(out.length).toBe(1024 * 1024);
  });
});
