import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';

const stub = createServer((req, res) => {
  res.writeHead(200, { 'content-type': 'application/rss+xml' });
  res.end([
    '<?xml version="1.0"?>',
    '<rss version="2.0"><channel>',
    '<item><title>Gold steadies as US real yields ease</title>',
    '<description><![CDATA[<b>Fed</b> cut odds support XAU/USD.]]></description>',
    '<pubDate>Tue, 24 Nov 2026 10:00:00 GMT</pubDate>',
    '<link>https://example.com/gold</link><source>Macro Desk</source></item>',
    '<item><title>Bitcoin ETF inflows rise</title>',
    '<description>Crypto only.</description><pubDate>Tue, 24 Nov 2026 09:00:00 GMT</pubDate>',
    '<link>https://example.com/crypto</link><source>Market Wire</source></item>',
    '</channel></rss>',
  ].join(''));
});

await new Promise(resolve => stub.listen(0, '127.0.0.1', resolve));
const port = stub.address().port;
process.env.GOLD_USD_NEWS_URL = `http://127.0.0.1:${port}/feed`;
process.env.NEWS_CACHE_SECONDS = '60';
process.env.NEWS_FOCUS_ONLY = 'true';
const { currentNews, newsDigest, newsStatus } = await import('../ai/news-adapter.mjs');

after(() => {
  stub.close();
  delete process.env.GOLD_USD_NEWS_URL;
});

test('configured RSS feed supplies sanitized gold and USD news only', async () => {
  const feed = await currentNews();
  assert.equal(feed.provider, 'rss');
  assert.equal(feed.items.length, 1);
  assert.equal(feed.items[0].title, 'Gold steadies as US real yields ease');
  assert.ok(feed.items[0].meta.includes('Gold/USD'));
  assert.ok(feed.items[0].summary.includes('Fed cut odds'));
  assert.ok(!feed.items[0].summary.includes('<b>'));
  assert.deepEqual(feed.focus, ['XAU/USD', 'DXY']);
});

test('news digest and status expose headlines without secrets', async () => {
  const digest = await newsDigest();
  assert.equal(digest.length, 1);
  assert.ok(digest[0].includes('Gold steadies'));
  const status = newsStatus();
  assert.equal(status.configured, true);
  assert.equal(status.keyConfigured, false);
  assert.equal(String(status.provider).includes('http'), false);
});
