/**
 * Social post URL detection and metadata extraction.
 */

const PATTERNS = [
  {
    platform: 'twitter',
    // x.com or twitter.com /{user}/status/{id}
    re: /^https?:\/\/(?:x\.com|twitter\.com)\/@?([\w]+)\/status\/(\d+)/,
    author: (m) => '@' + m[1],
    postId: (m) => m[2],
  },
  {
    platform: 'threads',
    // threads.com/@{user}/post/{id}  or  threads.net/@{user}/post/{id}
    re: /^https?:\/\/(?:www\.)?threads\.(?:com|net)\/@([\w.]+)\/post\/([\w]+)/,
    author: (m) => '@' + m[1],
    postId: (m) => m[2],
  },
  {
    platform: 'bluesky',
    // bsky.app/profile/{user}/post/{id}
    re: /^https?:\/\/bsky\.app\/profile\/([\w.@]+)\/post\/([\w]+)/,
    author: (m) => m[1],
    postId: (m) => m[2],
  },
];

/**
 * Detect whether a URL is a social media post.
 * Returns { isSocialPost, platform, author, postId } or { isSocialPost: false }.
 */
export function detectSocialPost(url) {
  for (const { platform, re, author, postId } of PATTERNS) {
    const m = url?.match(re);
    if (m) {
      return { isSocialPost: true, platform, author: author(m), postId: postId(m) };
    }
  }
  return { isSocialPost: false };
}
