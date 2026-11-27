const endpoint = process.env.GROQ_BASE_URL || 'https://api.groq.com/openai/v1/chat/completions';
const model = process.env.GROQ_MODEL || 'openai/gpt-oss-20b';

export function providerName() {
  return process.env.GROQ_API_KEY ? 'groq' : 'mock';
}

export function modelName() {
  return process.env.GROQ_API_KEY ? model : 'rule-based';
}

function localReply(messages) {
  const lastUser = [...messages].reverse().find(item => item?.role === 'user');
  const text = typeof lastUser?.content === 'string' ? lastUser.content.toLowerCase() : '';
  let reply;
  if (/platform|project|feature|tradewall|roadmap/.test(text)) {
    reply = 'TradeWall is a free-first dashboard for Forex, gold and crypto with a watchlist, chart, news feed, Supabase memory and a guarded trading roadmap. Live market adapters and real model-backed AI are the next phases.';
  } else if (/gold|xau|emas/.test(text)) {
    reply = 'Gold (XAU/USD) is driven mainly by real yields, the US dollar, inflation expectations and safe-haven demand. Watch US data releases, central-bank buying and spread widening; a 100 oz standard lot is much larger than most forex lots, so size positions carefully.';
  } else if (/crypto|btc|eth|bitcoin/.test(text)) {
    reply = 'Crypto trades 24/7, so gaps and session rules do not apply, but funding rate, open interest, liquidations and exchange risk matter. ETF flows and on-chain activity are useful context, and volatility is typically higher than in forex.';
  } else if (/forex|eur|gbp|usd|pip|dxy/.test(text)) {
    reply = 'For forex, track pip value, spread, swap and session overlap. DXY and rate differentials often drive major pairs, while CPI, NFP and FOMC can invalidate short-term technical setups quickly.';
  } else if (/risk|position|lot|leverage|stop/.test(text)) {
    reply = 'Risk first: define the exact stop distance, calculate position size from a fixed fraction of account equity, cap daily loss and total exposure, and never confuse leverage with edge. Educational only, not financial advice.';
  } else {
    reply = 'I can analyse the selected Forex, gold or crypto instrument, explain moves using the current watchlist and news, and discuss risk. Set GROQ_API_KEY on the server for a live model. Informational only, not financial advice.';
  }
  return `${reply}\n\n(Local fallback reply; no live AI provider is configured.)`;
}

export async function complete(messages) {
  if (!process.env.GROQ_API_KEY) return { reply: localReply(messages), provider: 'mock', model: 'rule-based' };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000);
  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages,
        temperature: 0.4,
        max_tokens: 500,
      }),
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`AI provider returned ${response.status}`);
    const data = await response.json();
    const reply = data?.choices?.[0]?.message?.content?.trim();
    if (!reply) throw new Error('AI provider returned an empty reply');
    return { reply, provider: 'groq', model };
  } finally {
    clearTimeout(timer);
  }
}
