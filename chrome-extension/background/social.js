/**
 * Social post URL detection and metadata extraction.
 */

/**
 * Detect whether a URL is a YouTube video.
 * Returns { isVideo, platform, video_id } or { isVideo: false }.
 */
export function detectVideo(url) {
  // youtube.com/watch?v=ID
  let m = url?.match(/[?&]v=([\w-]{11})/);
  if (m && url.includes('youtube.com')) return { isVideo: true, platform: 'youtube', video_id: m[1] };
  // youtu.be/ID
  m = url?.match(/youtu\.be\/([\w-]{11})/);
  if (m) return { isVideo: true, platform: 'youtube', video_id: m[1] };
  // youtube.com/shorts/ID
  m = url?.match(/youtube\.com\/shorts\/([\w-]{11})/);
  if (m) return { isVideo: true, platform: 'youtube', video_id: m[1] };
  // tiktok.com/@user/video/ID
  m = url?.match(/tiktok\.com\/@[\w.]+\/video\/(\d+)/);
  if (m) return { isVideo: true, platform: 'tiktok', video_id: m[1] };
  return { isVideo: false };
}

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
