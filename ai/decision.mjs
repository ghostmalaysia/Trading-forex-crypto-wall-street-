import { learningDigest } from './learning.mjs';

function dash(value) {
  return value == null || value === '' ? '—' : value;
}

export function decisionExplanation(analysis, plan, risk, context) {
  const bias = plan?.bias || 'neutral';
  const action = bias === 'bullish' ? 'BUY' : bias === 'bearish' ? 'SELL' : 'NO TRADE';
  const eligible = !!risk?.eligible;
  const rr = risk?.rewardRisk ?? 0;
  const lines = [];
  lines.push(`**Keputusan AI: ${eligible ? action : 'NO TRADE'}**`);
  lines.push(`Simbol: ${context?.selected || analysis?.symbol || '—'} • timeframe ${context?.timeframe || analysis?.timeframe || '—'}.`);
  lines.push('');
  lines.push('**Kenapa**');
  if (bias === 'bullish') {
    lines.push(`- Harga terakhir ${dash(analysis?.last)} berada di atas SMA20 ${dash(analysis?.sma20)} dengan slope ${dash(analysis?.slopePct)}%; ini menyokong hipotesis pembeli.`);
  } else if (bias === 'bearish') {
    lines.push(`- Harga terakhir ${dash(analysis?.last)} berada di bawah SMA20 ${dash(analysis?.sma20)} dengan slope ${dash(analysis?.slopePct)}%; ini menyokong hipotesis penjual.`);
  } else {
    lines.push('- Graf tidak memberi arah yang cukup jelas antara SMA20/SMA50, jadi sistem tidak mencari arah.');
  }
  lines.push(`- Momentum: RSI14 ${dash(analysis?.rsi14)}. Volatiliti: ATR ${dash(analysis?.atr)} (${dash(analysis?.volatilityPct)}%).`);
  lines.push(`- Julat 20 sampel: ${dash(analysis?.recentLow)}–${dash(analysis?.recentHigh)}. Entry ${dash(plan?.entry)}, stop ${dash(plan?.stopLoss)}, target ${dash(plan?.takeProfit)}.`);
  lines.push(`- Nisbah ganjaran/risiko: ${rr}. ${rr >= 1.5 ? 'Lulus syarat minimum 1.5.' : 'Gagal syarat minimum 1.5, jadi cadangan ditolak.'}`);
  lines.push('');
  lines.push('**Semakan risiko (deterministik)**');
  for (const check of risk?.checks || []) {
    lines.push(`- ${check.pass ? 'PASS' : 'FAIL'} ${check.name}: ${check.detail}`);
  }
  lines.push('');
  lines.push('**Pembelajaran paper**');
  const lessons = learningDigest(3);
  if (lessons.length) lessons.forEach(item => lines.push(`- ${item}`));
  else lines.push('- Belum ada outcome paper; sistem masih mengumpulkan bukti.');
  lines.push('');
  lines.push('**Tindakan sebenar**');
  lines.push(eligible
    ? '- Cadangan ini layak untuk **paper approval**. AI tidak menempah order; reviewer manusia mesti approve atau reject.'
    : '- Tiada tindakan diteruskan. Gate risiko menyekat cadangan ini.');
  lines.push('- Ini educational only, bukan nasihat kewangan dan bukan order live.');
  return lines.join('\n');
}

export function decisionAction(plan, risk) {
  const bias = plan?.bias || 'neutral';
  return {
    action: bias === 'bullish' ? 'BUY' : bias === 'bearish' ? 'SELL' : 'NO TRADE',
    eligible: !!risk?.eligible,
    decision: risk?.decision || 'blocked',
    rewardRisk: risk?.rewardRisk || 0,
  };
}
