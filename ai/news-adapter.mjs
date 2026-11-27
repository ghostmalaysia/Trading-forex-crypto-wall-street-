import { CALENDAR, FOCUS, NEWS } from '../shared/feed-data.js';

const feedUrl = String(process.env.GOLD_USD_NEWS_URL || process.env.NEWS_FEED_URL || '').trim();
const apiKey = String(process.env.NEWS_API_KEY || '').trim();
const keyHeader = String(process.env.NEWS_API_KEY_HEADER || 'x-api-key').trim();
const focusOnly = String(process.env.NEWS_FOCUS_ONLY || 'true').toLowerCase() !== 'false';
const timeoutMs = Math.min(15000, Math.max(1000, Number(process.env.NEWS_REQUEST_TIMEOUT_MS) || 6000));
const cacheSeconds = Math.min(3600, Math.max(0, Number(process.env.NEWS_CACHE_SECONDS) || 600));
const maxItems = Math.min(30, Math.max(1, Number(process.env.NEWS_MAX_ITEMS) || 8));
const focusPattern = /gold|xau|dollar|dxy|usd|fed|fomc|inflation|cpi|pce|nfp|payroll|treasury|yield|real yield/i;
let cache = null;

function clean(value, limit = 240) {
  return String(value ?? '')
    .replace(/<!\[CDATA\[|\]\]>/g, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;|&#160;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, limit);
}

function safeUrl(value) {
  const text = clean(value, 500);
  if (!/^https?:\/\//i.test(text)) return null;
  return text;
}

function focusScore(item) {
  return focusPattern.test(`${item.title || ''} ${item.summary || ''}`) ? 1 : 0;
}

function normalizeItems(rows) {
  return rows
    .map(row => ({
      title: clean(row.title, 180),
      summary: clean(row.summary, 300),
      source: clean(row.source, 60) || 'News feed',
      publishedAt: clean(row.publishedAt, 40),
      url: safeUrl(row.url),
    }))
    .filter(item => item.title);
}

function parseJsonFeed(body) {
  const data = JSON.parse(body);
  const rows = Array.isArray(data)
    ? data
    : Array.isArray(data?.items) ? data.items
      : Array.isArray(data?.articles) ? data.articles
        : Array.isArray(data?.results) ? data.results
          : Array.isArray(data?.data) ? data.data : [];
  return normalizeItems(rows.slice(0, 40).map(row => ({
    title: row?.title || row?.headline || row?.name,
    summary: row?.summary || row?.description || row?.body || row?.content,
    source: typeof row?.source === 'string' ? row.source : row?.source?.name,
    publishedAt: row?.publishedAt || row?.published_at || row?.pubDate || row?.date,
    url: row?.url || row?.link || row?.guid,
  })));
}

function tagValue(block, names, limit = 300) {
  for (const name of names) {
    const match = block.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${name}>`, 'i'));
    if (match) return clean(match[1], limit);
  }
  return '';
}

function parseXmlFeed(body) {
  const blocks = body.match(/<(?:item|entry)\b[\s\S]*?<\/(?:item|entry)>/gi) || [];
  return normalizeItems(blocks.slice(0, 40).map(block => {
    const href = block.match(/<link[^>]*href\s*=\s*["']([^"']+)["']/i)?.[1];
    return {
      title: tagValue(block, ['title'], 180),
      summary: tagValue(block, ['description', 'summary'], 300),
      source: tagValue(block, ['source', 'author', 'category'], 60),
      publishedAt: tagValue(block, ['pubDate', 'published', 'updated', 'dc:date'], 40),
      url: href || tagValue(block, ['link'], 500),
    };
  }));
}

function curated() {
  return {
    items: NEWS,
    calendar: CALENDAR,
    focus: FOCUS,
    provider: 'curated-mock',
    fetchedAt: new Date().toISOString(),
    detail: null,
  };
}

function decorate(items) {
  return items.map(item => ({
    title: item.title,
    meta: `${item.source} • ${item.publishedAt || 'latest'} • ${focusScore(item) ? 'Gold/USD' : 'Market'}`,
    summary: item.summary || '',
    url: item.url || null,
    publishedAt: item.publishedAt || null,
  }));
}

function buildPayload(items, provider) {
  const scored = items.map(item => ({ ...item, focus: focusScore(item) }));
  const focused = scored.filter(item => item.focus);
  const chosen = focusOnly && focused.length ? focused : scored;
  chosen.sort((a, b) => b.focus - a.focus || String(b.publishedAt).localeCompare(String(a.publishedAt)));
  return {
    items: decorate(chosen.slice(0, maxItems)),
    calendar: CALENDAR,
    focus: FOCUS,
    provider,
    fetchedAt: new Date().toISOString(),
    detail: null,
  };
}

export function newsStatus() {
  return {
    configured: !!feedUrl,
    urlConfigured: !!feedUrl,
    keyConfigured: !!apiKey,
    focusOnly,
    provider: cache?.payload?.provider || (feedUrl ? 'pending' : 'curated-mock'),
  };
}

export async function currentNews() {
  if (!feedUrl) return curated();
  if (cache && Date.now() - cache.at < cacheSeconds * 1000) return cache.payload;
  const headers = { Accept: 'application/rss+xml, application/atom+xml, application/json;q=0.9, */*;q=0.8' };
  const headerName = /^[a-z0-9-]+$/i.test(keyHeader) ? keyHeader : 'x-api-key';
  if (apiKey) headers[headerName] = apiKey;
  try {
    const response = await fetch(feedUrl, { headers, signal: AbortSignal.timeout(timeoutMs) });
    if (!response.ok) throw new Error(`news provider ${response.status}`);
    const body = await response.text();
    const isJson = /^\s*[\[{]/.test(body);
    const rows = isJson ? parseJsonFeed(body) : parseXmlFeed(body);
    if (!rows.length) throw new Error('empty feed');
    cache = { at: Date.now(), payload: buildPayload(rows, isJson ? 'json' : 'rss') };
    return cache.payload;
  } catch {
    cache = { at: Date.now(), payload: { ...curated(), provider: 'curated-fallback', detail: 'configured feed unavailable' } };
    return cache.payload;
  }
}

export async function newsDigest() {
  const feed = await currentNews();
  return feed.items.slice(0, 6).map(item => `${item.title}${item.meta ? ` (${item.meta})` : ''}`);
}
