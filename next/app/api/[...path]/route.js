export const dynamic = 'force-dynamic';

const hopByHop = new Set(['host', 'content-length', 'connection', 'keep-alive', 'transfer-encoding', 'upgrade']);

async function proxy(request, context) {
  const params = await context.params;
  const segments = Array.isArray(params?.path) ? params.path : [];
  const upstream = process.env.TRADEWALL_UPSTREAM || 'http://127.0.0.1:8080';
  const target = new URL(`/api/${segments.join('/')}`, upstream);
  target.search = request.nextUrl.search;

  const headers = new Headers();
  for (const [key, value] of request.headers) {
    if (!hopByHop.has(key.toLowerCase())) headers.set(key, value);
  }

  try {
    const init = { method: request.method, headers, cache: 'no-store' };
    if (!['GET', 'HEAD'].includes(request.method)) init.body = await request.arrayBuffer();
    const response = await fetch(target, init);
    const outHeaders = new Headers();
    const contentType = response.headers.get('content-type');
    if (contentType) outHeaders.set('content-type', contentType);
    outHeaders.set('cache-control', 'no-store');
    for (const cookie of response.headers.getSetCookie?.() || []) outHeaders.append('set-cookie', cookie);
    return new Response(response.body, { status: response.status, statusText: response.statusText, headers: outHeaders });
  } catch (error) {
    return Response.json({ error: 'TradeWall upstream unavailable', detail: String(error.message).slice(0, 120) }, { status: 502 });
  }
}

export const GET = proxy;
export const POST = proxy;
export const PUT = proxy;
export const PATCH = proxy;
export const DELETE = proxy;
