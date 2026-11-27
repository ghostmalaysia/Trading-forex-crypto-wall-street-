import { systemPrompt } from './prompt.mjs';
import { learningDigest } from './learning.mjs';

function money(value) {
  const number = Number(value);
  return Number.isFinite(number) ? `$${number.toFixed(2)}` : '—';
}

function valueOrDash(value) {
  return value == null || value === '' ? '—' : value;
}

export function buildResearchInput(analysis, context) {
  const account = context?.paperAccount || {};
  const symbol = context?.selected || analysis?.symbol || 'XAU/USD';
  const isGold = /xau|gold/i.test(String(symbol));
  return {
    symbol,
    focus: isGold ? 'XAU/USD (emas)' : 'DXY (USD)',
    timeframe: context?.timeframe || analysis?.timeframe || '1D',
    dataSource: context?.dataSource || analysis?.dataSource || 'mock',
    observed: {
      last: valueOrDash(analysis?.last),
      changePct: valueOrDash(analysis?.changePct),
      sma20: valueOrDash(analysis?.sma20),
      sma50: valueOrDash(analysis?.sma50),
      rsi14: valueOrDash(analysis?.rsi14),
      atr: valueOrDash(analysis?.atr),
      volatilityPct: valueOrDash(analysis?.volatilityPct),
      recentHigh: valueOrDash(analysis?.recentHigh),
      recentLow: valueOrDash(analysis?.recentLow),
      slopePct: valueOrDash(analysis?.slopePct),
      trend: valueOrDash(analysis?.trend),
      points: valueOrDash(analysis?.points),
    },
    domainChecklist: isGold
      ? ['DXY / US dollar direction', 'US real yields and Fed expectations', 'CPI / NFP / FOMC timing', 'safe-haven flows', 'spread widening during news', 'inverse correlation with DXY']
      : ['rate differentials', 'Fed policy and FOMC', 'Treasury yields', 'CPI / NFP / PCE', 'risk-on/risk-off flows', 'direction implied for XAU/USD'],
    capital: {
      mode: account.mode || 'paper',
      equity: money(account.equity),
      startingCapital: money(account.startingCapital),
      maxRiskPct: valueOrDash(account.maxRiskPct),
      maxDailyLossPct: valueOrDash(account.maxDailyLossPct),
      maxOpenPositions: valueOrDash(account.maxOpenPositions),
      openPositions: valueOrDash(account.openPositions),
      dailyLossPct: valueOrDash(account.dailyLossPct),
      blocked: !!account.blocked,
    },
    lessons: learningDigest(),
    news: Array.isArray(context?.news) ? context.news.slice(0, 8) : [],
    candle: context?.candleAnalysis?.signal || null,
  };
}

export function researchSystemPrompt(knowledge, context) {
  return [
    systemPrompt(knowledge, context),
    '',
    'Deep-research mode. Produce a detailed but readable educational report in the same language as the user, using these exact headings:',
    '1. RINGKASAN (3 ayat maksimum)',
    '2. BUKTI DARI DATA (cite the supplied numbers; separate observed facts from interpretation)',
    '3. TAFSIR STRUKTUR (trend, range, breakout/failed move, momentum, volatility regime)',
    '4. KONTEKS USD/GOLD (explain which macro drivers matter and which are unknown here)',
    '5. PEMBELAJARAN SISTEM (use saved paper lessons; say clearly if evidence is still thin)',
    '6. SENARIO (bullish, bearish, neutral; each with trigger and invalidation)',
    '7. CADANGAN PAPER (entry, stop, target, sizing from the stated equity and 1% cap; never a real order)',
    '8. RISIKO & PEMBATALAN (R:R, daily loss cap, exposure, news spread, human approval)',
    '9. KEPUTUSAN (confidence low/medium/high and one explicit question for the human reviewer)',
    '',
    'Never invent macro data that is not in the context. Label assumptions as assumptions. Do not claim certainty or returns. A deterministic risk gate and a human approve/reject step always remain mandatory.',
    'Structured research input (data only):',
    JSON.stringify(context?.researchInput || {}),
  ].join('\n');
}

export function localResearch(analysis, context) {
  const input = buildResearchInput(analysis, context);
  const observed = input.observed;
  const trend = String(observed.trend || 'mixed');
  const rsi = observed.rsi14;
  const rsiText = rsi == null ? 'RSI belum tersedia' : `RSI14 ${rsi}`;
  const last = observed.last;
  const high = observed.recentHigh;
  const low = observed.recentLow;
  const riskPerTrade = context?.paperAccount?.equity
    ? money((Number(context.paperAccount.equity) * Number(context.paperAccount.maxRiskPct || 1)) / 100)
    : '$1.00';
  const dailyCap = context?.paperAccount?.startingCapital
    ? money((Number(context.paperAccount.startingCapital) * Number(context.paperAccount.maxDailyLossPct || 3)) / 100)
    : '$3.00';
  const lessonText = input.lessons.length
    ? input.lessons.map(item => `- ${item}`).join('\n')
    : '- Belum ada outcome paper yang dinilai; sistem masih mengumpulkan bukti.';
  const newsText = input.news.length
    ? input.news.map(item => `- Berita semasa: ${item}`).join('\n')
    : '- Tiada feed berita semasa dikonfigurasi; katalis makro tidak disahkan.';
  const candleText = input.candle
    ? `- Isyarat candle: ${input.candle.action} (${input.candle.confidence}) — ${input.candle.label || 'tiada corak jelas'}.`
    : '- Tiada corak candle yang dikunci pada bacaan ini.';
  const gold = input.focus.includes('XAU');
  return [
    '**1. RINGKASAN**',
    `Fokus semasa ialah ${input.focus} pada timeframe ${input.timeframe}. Graf menunjukkan struktur **${trend}** dengan harga terakhir **${last}**, ${rsiText}, dan volatiliti sekitar **${observed.volatilityPct}%**. Ini adalah bacaan paper/educational; tiada order sebenar ditempatkan.`,
    '',
    '**2. BUKTI DARI DATA**',
    `- Harga: ${last} (perubahan ${observed.changePct}%).`,
    `- Purata: SMA20 ${observed.sma20}, SMA50 ${observed.sma50}; slope 10 sampel ${observed.slopePct}%.`,
    `- Momentum & volatiliti: ${rsiText}, ATR ${observed.atr}, julat 20 sampel ${low}–${high}.`,
    `- Kualiti data: ${observed.points} sampel, sumber ${input.dataSource}. ${analysis?.insufficient ? 'Data tidak mencukupi untuk kesimpulan kukuh.' : 'Data mencukupi untuk analisis teknikal asas.'}`,
    '- Tafsiran: angka di atas ialah fakta graf; arah seterusnya ialah hipotesis, bukan kepastian.',
    '',
    '**3. TAFSIR STRUKTUR**',
    trend === 'bullish'
      ? `Harga berada di atas SMA20 dan purata lebih pendek condong naik. Hipotesis: pembeli mengawal struktur; kegagalan mengekalkan SMA20 akan melemahkan tesis.`
      : trend === 'bearish'
        ? `Harga berada di bawah SMA20 dan purata condong turun. Hipotesis: penjual mengawal struktur; penutupan semula di atas SMA20 akan membatalkan tesis.`
        : `Harga tidak memberi arah jelas antara SMA20/SMA50. Hipotesis: pasar sedang bergerak dalam julat atau menunggu katalis; menunggu breakout lebih masuk akal daripada meneka arah.`,
    '',
    '**4. KONTEKS USD/GOLD**',
    gold
      ? 'Emas dipengaruhi oleh DXY, hasil bon AS sebenar, jangkaan Fed, inflasi, permintaan safe-haven dan central-bank buying. Dalam sistem ini DXY ialah pasangan semakan: jika DXY mengukuh, gold long perlu berhati-hati.'
      : 'DXY dipengaruhi oleh perbezaan kadar faedah, dasar Fed/FOMC, hasil Treasury, data CPI/NFP/PCE dan aliran risk-on/risk-off. DXY juga memberi petunjuk arah untuk XAU/USD.',
    newsText,
    candleText,
    '',
    '**5. PEMBELAJARAN SISTEM**',
    lessonText,
    '',
    '**6. SENARIO**',
    `- Bullish: ${trend === 'bullish' ? 'kekalkan di atas SMA20' : `tembus dan kekalkan di atas ${high}`}; sasaran teknikal berikutnya ialah julat atas + ATR.`,
    `- Bearish: ${trend === 'bearish' ? 'kekalkan di bawah SMA20' : `jatuh dan kekalkan di bawah ${low}`}; sasaran teknikal berikutnya ialah julat bawah - ATR.`,
    '- Neutral: harga kembali ke dalam julat dan RSI berada di tengah; tiada cadangan arah dikeluarkan.',
    '',
    '**7. CADANGAN PAPER**',
    `- Modal paper: ${input.capital.startingCapital}; ekuiti semasa ${input.capital.equity}.`,
    `- Risiko maksimum 1% = ${riskPerTrade} setiap trade; had rugi harian 3% = ${dailyCap}.`,
    `- Jika gate meluluskan, saiz kedudukan dikira daripada jarak stop: unit = (ekuiti × 1%) ÷ jarak stop.`,
    '- Cadangan mesti melalui risk gate dan kelulusan manusia sebelum simulasi; tiada live order.',
    '',
    '**8. RISIKO & PEMBATALAN**',
    '- Nisbah ganjaran/risiko minimum 1.5; jika lebih rendah, cadangan ditolak.',
    `- Pendedahan maksimum ${input.capital.maxOpenPositions} posisi; rugi harian had ${input.capital.maxDailyLossPct}%.`,
    '- Elak entry semasa data AS berimpak tinggi kerana spread boleh melebar.',
    `- Status akaun: ${input.capital.blocked ? 'BLOCKED — had risiko dicapai' : 'tersedia untuk paper review'}.`,
    '',
    '**9. KEPUTUSAN**',
    `- Keyakinan: ${analysis?.insufficient ? 'low' : trend === 'mixed' ? 'low' : rsi != null && rsi > 30 && rsi < 70 ? 'medium' : 'low'}.`,
    '- Soalan untuk reviewer: adakah anda mahu menunggu pengesahan struktur pada timeframe ini, atau menolak cadangan ini dan mengumpulkan lebih banyak data paper?',
    '',
    'Educational only — bukan nasihat kewangan.',
  ].join('\n');
}

export async function buildResearch(analysis, context, { complete, knowledge }) {
  const input = buildResearchInput(analysis, context);
  const enriched = { ...context, researchInput: input };
  const system = researchSystemPrompt(knowledge, enriched);
  const result = await complete([
    { role: 'system', content: system },
    { role: 'user', content: `Hasilkan laporan analisis mendalam untuk ${input.focus} berdasarkan data yang dibekalkan.` },
  ]);
  return {
    reply: result.provider === 'mock' ? localResearch(analysis, enriched) : result.reply,
    provider: result.provider,
    model: result.model,
    input,
    disclaimer: 'Informational only; not financial advice.',
  };
}
