import { describe, expect, it } from 'vitest';
import { buildJevQuestions, JEV_MAX_TAGS, JEV_THRESHOLD, pickJevTags, TAG_VOCABULARY } from './jev-tagger.js';

describe('buildJevQuestions', () => {
  it('builds one noul question per vocabulary entry with identifier-safe names', () => {
    const { questions, nameToTagTitle } = buildJevQuestions({
      'ai-news': 'News about AI companies',
      openai: 'About OpenAI',
    });

    expect(Object.keys(questions)).toEqual(['ai_news', 'openai']);
    expect(questions.ai_news).toEqual({
      type: 'noul',
      instructions: 'The saved item is about this topic: News about AI companies',
    });
    expect(nameToTagTitle).toEqual({ ai_news: 'ai-news', openai: 'openai' });
  });

  it('covers the full curated vocabulary without collisions', () => {
    const { questions, nameToTagTitle } = buildJevQuestions();
    expect(Object.keys(questions)).toHaveLength(Object.keys(TAG_VOCABULARY).length);
    expect(Object.keys(nameToTagTitle)).toHaveLength(Object.keys(TAG_VOCABULARY).length);
  });
});

describe('pickJevTags', () => {
  const nameToTagTitle = { ai_news: 'ai-news', openai: 'openai', programming: 'programming' };

  it('keeps only answers at or above the threshold', () => {
    const answers = {
      ai_news: { type: 'noul', noul: 0.9 },
      openai: { type: 'noul', noul: 0.59 },
      programming: { type: 'noul', noul: 0.6 },
    };
    expect(pickJevTags(answers, nameToTagTitle)).toEqual(['ai-news', 'programming']);
  });

  it('sorts by score descending', () => {
    const answers = {
      ai_news: { type: 'noul', noul: 0.65 },
      openai: { type: 'noul', noul: 0.95 },
      programming: { type: 'noul', noul: 0.8 },
    };
    expect(pickJevTags(answers, nameToTagTitle)).toEqual(['openai', 'programming', 'ai-news']);
  });

  it('caps results at max', () => {
    const answers = {
      ai_news: { type: 'noul', noul: 0.9 },
      openai: { type: 'noul', noul: 0.9 },
      programming: { type: 'noul', noul: 0.9 },
    };
    expect(pickJevTags(answers, nameToTagTitle, { max: 2 })).toHaveLength(2);
  });

  it('returns nothing when answers are missing or malformed', () => {
    expect(pickJevTags(null, nameToTagTitle)).toEqual([]);
    expect(pickJevTags({}, nameToTagTitle)).toEqual([]);
    expect(pickJevTags({ ai_news: { type: 'noul', noul: 'high' } }, nameToTagTitle)).toEqual([]);
  });

  it('uses the exported defaults', () => {
    expect(JEV_THRESHOLD).toBe(0.6);
    expect(JEV_MAX_TAGS).toBe(5);
  });
});
