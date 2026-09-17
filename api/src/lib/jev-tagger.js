// Curated tag vocabulary for TypeSafe Jev auto-tagging (2026-09-17).
// Only these tags are auto-applied by enrichment; every other tag in the DB
// stays manual-only. Keys match existing tag titles in D1 (resolved
// case-insensitively) and values are the topic description sent to Jev.
export const TAG_VOCABULARY = {
  'ai-news': 'News about AI companies, model releases, funding or AI industry events',
  openai: 'Specifically about OpenAI or its products (ChatGPT, GPT, Codex, Astra)',
  anthropic: 'Specifically about Anthropic or its products (Claude, Claude Code, MCP launched by Anthropic)',
  google: 'Specifically about Google, DeepMind or Gemini',
  microsoft: 'Specifically about Microsoft or GitHub',
  nvidia: 'Specifically about Nvidia',
  xai: 'Specifically about xAI or Grok',
  deepseek: 'Specifically about DeepSeek',
  mcp: 'About the Model Context Protocol (MCP)',
  'ai-workflow': 'Practical use of AI tools or agents in day-to-day work or software development',
  'ai-safety': 'AI safety, alignment, dangerous capabilities or risk evaluations',
  'ai-ethics': 'Ethical or societal questions raised by AI',
  policy: 'Government regulation, law, export controls or public policy',
  security: 'Cybersecurity, vulnerabilities, security fixes',
  programming: 'Mainly about writing code, programming languages or developer tools (not merely an AI model release)',
  robotics: 'Robots and humanoids',
  'management-practices': 'Leadership, management and how teams are organized',
  'psychological-safety': 'Psychological safety in teams',
  agile: 'Agile methods, scrum, iterative delivery',
  economy: 'Economics, markets, IPOs, valuations',
  education: 'Schools, teaching and education',
  health: 'Health and medicine',
  math: 'Mathematics',
  freedom: 'Freedom and liberty as a theme',
  identity: 'Personal identity, who we are',
  life: 'Reflections on how to live life',
  comics: 'Comics or cartoons',
  work: 'The nature of work, jobs and careers',
};

export const JEV_THRESHOLD = 0.6;
export const JEV_MAX_TAGS = 5;
const JEV_SUMMARY_LIMIT = 2000;

/**
 * Build the Jev `questions` payload plus a map from the identifier-safe
 * question name back to the original tag title (Jev question names must be
 * identifier-safe, so hyphens become underscores).
 */
export function buildJevQuestions(vocabulary = TAG_VOCABULARY) {
  const questions = {};
  const nameToTagTitle = {};

  for (const [tagTitle, topic] of Object.entries(vocabulary)) {
    const name = tagTitle.replace(/-/g, '_');
    questions[name] = { type: 'noul', instructions: `The saved item is about this topic: ${topic}` };
    nameToTagTitle[name] = tagTitle;
  }

  return { questions, nameToTagTitle };
}

/**
 * Pick tag titles from Jev's answers: score >= threshold, highest first,
 * capped at max.
 */
export function pickJevTags(answers, nameToTagTitle, { threshold = JEV_THRESHOLD, max = JEV_MAX_TAGS } = {}) {
  if (!answers || typeof answers !== 'object') return [];

  const scored = [];
  for (const [name, tagTitle] of Object.entries(nameToTagTitle)) {
    const score = answers[name]?.noul;
    if (typeof score === 'number' && score >= threshold) {
      scored.push({ tagTitle, score });
    }
  }

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, max).map((s) => s.tagTitle);
}

async function callJev(apiKey, state) {
  const res = await fetch('https://api.typesafe.ai/v1/systemone', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'jev-latest',
      state,
      questions: buildJevQuestions().questions,
    }),
  });

  if (!res.ok) {
    throw new Error(`Jev API error: ${res.status}`);
  }

  const json = await res.json();
  return json.answers;
}

/**
 * Tag an idea via TypeSafe Jev. Resolves picked tag titles to existing tag
 * ids (case-insensitive), skipping any tag not present in `tags`.
 * Throws on any API/network failure — callers fall back to the llama tagger.
 */
export async function tagIdsFromJev(apiKey, idea, tags) {
  const state = {
    title: idea.title ?? '',
    summary: (idea.summary ?? '').slice(0, JEV_SUMMARY_LIMIT),
    url: idea.url ?? '',
  };

  const answers = await callJev(apiKey, state);
  const { nameToTagTitle } = buildJevQuestions();
  const pickedTitles = pickJevTags(answers, nameToTagTitle);

  const byLowerTitle = new Map(tags.map((t) => [t.title?.toLowerCase(), t.id]));
  return pickedTitles.map((title) => byLowerTitle.get(title.toLowerCase())).filter(Boolean);
}
