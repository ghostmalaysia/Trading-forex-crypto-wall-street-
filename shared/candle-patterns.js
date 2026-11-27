const focusSymbols = ['XAU/USD', 'DXY'];

function finite(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function text(value, max = 32) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function round(value) {
  const number = finite(value);
  if (number === null) return null;
  return +number.toFixed(Math.abs(number) >= 10 ? 2 : 5);
}

export function normalizeCandleSeries(value) {
  if (!Array.isArray(value)) return [];
  return value.slice(-120).map(item => {
    if (item && typeof item === 'object') {
      const open = finite(item.open ?? item.o);
      const high = finite(item.high ?? item.h);
      const low = finite(item.low ?? item.l);
      const close = finite(item.close ?? item.c);
      if (open !== null && high !== null && low !== null && close !== null) {
        return {
          open: round(open),
          high: round(Math.max(high, open, close)),
          low: round(Math.min(low, open, close)),
          close: round(close),
        };
      }
    }
    const close = finite(item);
    return close === null ? null : round(close);
  }).filter(item => item !== null);
}

export function toCandles(series) {
  const values = normalizeCandleSeries(series);
  const closes = values.map(item => typeof item === 'number' ? item : item.close);
  const rawSpan = closes.length ? Math.max(...closes) - Math.min(...closes) : 0;
  const span = rawSpan > 1e-9 ? rawSpan : Math.max(Math.abs(closes.at(-1) || 1) * 0.01, 0.0001);
  return values.map((item, index) => {
    if (typeof item === 'object') {
      const body = Math.abs(item.close - item.open);
      const range = item.high - item.low || Math.max(body, span * 0.01);
      return {
        index,
        ...item,
        body: round(body),
        range: round(range),
        direction: item.close >= item.open ? 'bullish' : 'bearish',
      };
    }
    const close = item;
    const open = index ? closes[index - 1] : close;
    const body = Math.abs(close - open);
    const base = Math.max(body * 0.35, span * 0.006);
    const upper = base * (0.5 + Math.abs(Math.sin((index + 1) * 1.7 + close * 0.01)) * 1.1);
    const lower = base * (0.5 + Math.abs(Math.cos((index + 1) * 2.3 + close * 0.013)) * 1.1);
    return {
      index,
      open: round(open),
      high: round(Math.max(open, close) + upper),
      low: round(Math.min(open, close) - lower),
      close: round(close),
      body: round(body),
      range: round(body + upper + lower),
      direction: close >= open ? 'bullish' : 'bearish',
    };
  });
}

function upperWick(candle) {
  return Math.max(0, candle.high - Math.max(candle.open, candle.close));
}

function lowerWick(candle) {
  return Math.max(0, Math.min(candle.open, candle.close) - candle.low);
}

function bodyRatio(candle) {
  return candle.range > 0 ? candle.body / candle.range : 0;
}

function priorTrend(candles, index) {
  const slice = candles.slice(Math.max(0, index - 3), index);
  if (slice.length < 2) return 'flat';
  const change = slice.at(-1).close - slice[0].close;
  const tolerance = Math.max(slice.at(-1).range * 0.35, slice.at(-1).body * 0.5, 1e-9);
  return change > tolerance ? 'up' : change < -tolerance ? 'down' : 'flat';
}

function pattern(id, label, bias, explanation, confirmation, priority) {
  return { id, label, bias, explanation, confirmation, priority };
}

function neutralSignal(symbol, timeframe, reason) {
  return {
    action: 'NO TRADE',
    bias: 'neutral',
    confidence: 'low',
    pattern: null,
    label: 'Tiada corak jelas',
    reason,
    paperOnly: true,
    educational: true,
    signature: `${symbol}:${timeframe}:NO TRADE:none`,
  };
}

export function detectCandlePatterns(series, options = {}) {
  const symbol = text(options.symbol, 32);
  const timeframe = text(options.timeframe, 8);
  const candles = toCandles(series);
  if (candles.length < 3) {
    return {
      symbol,
      timeframe,
      insufficient: true,
      candles,
      patterns: [],
      signal: neutralSignal(symbol, timeframe, 'Data carta tidak mencukupi untuk membaca corak candle.'),
      summary: 'Data carta tidak mencukupi. Sediakan sekurang-kurangnya tiga titik harga.',
    };
  }
  const last = candles.at(-1);
  const previous = candles.at(-2);
  const trend = priorTrend(candles, candles.length - 1);
  const up = upperWick(last);
  const down = lowerWick(last);
  const ratio = bodyRatio(last);
  const patterns = [];

  if (ratio <= 0.12 && last.range > 0) {
    patterns.push(pattern(
      'doji',
      'Doji',
      'neutral',
      `Badan kecil (${round(last.body)} vs julat ${round(last.range)}): open dan close hampir sama, jadi pembeli dan penjual seimbang. Sumbu atas ${round(up)} dan bawah ${round(down)} menunjukkan harga ditolak dua hala.`,
      'Tunggu candle seterusnya keluar dari julat doji sebelum memilih arah.',
      1,
    ));
  }
  if (trend === 'down' && ratio <= 0.35 && down >= last.body * 2 && up <= Math.max(last.body, down * 0.5)) {
    patterns.push(pattern(
      'hammer',
      'Hammer',
      'bullish',
      `Selepas tiga candle menurun, badan kecil ${round(last.body)} dengan sumbu bawah panjang ${round(down)}: harga jatuh tetapi ditolak pembeli dan ditutup semula berhampiran open.`,
      'Pengesahan: candle berikutnya perlu tutup di atas high hammer sebelum BUY dipertimbangkan.',
      3,
    ));
  }
  if (trend === 'down' && ratio <= 0.35 && up >= last.body * 2 && down <= Math.max(last.body, up * 0.5)) {
    patterns.push(pattern(
      'inverted_hammer',
      'Inverted Hammer',
      'bullish',
      `Sumbu atas panjang ${round(up)} selepas penurunan menunjukkan pembeli cuba menaikkan harga, tetapi belum berjaya menutup di atasnya.`,
      'Pengesahan: tutup di atas high candle ini dan semak RSI/ATR sebelum BUY.',
      3,
    ));
  }
  if (trend === 'up' && ratio <= 0.35 && up >= last.body * 2 && down <= Math.max(last.body, up * 0.5)) {
    patterns.push(pattern(
      'shooting_star',
      'Shooting Star',
      'bearish',
      `Selepas kenaikan, sumbu atas panjang ${round(up)} dan badan kecil ${round(last.body)}: pembeli tolak ke atas gagal dan harga ditutup semula rendah.`,
      'Pengesahan: candle seterusnya perlu tutup di bawah low untuk SELL dipertimbangkan.',
      3,
    ));
  }
  if (trend === 'up' && ratio <= 0.35 && down >= last.body * 2 && up <= Math.max(last.body, down * 0.5)) {
    patterns.push(pattern(
      'hanging_man',
      'Hanging Man',
      'bearish',
      `Sumbu bawah panjang ${round(down)} selepas kenaikan menunjukkan tekanan jual mula muncul walaupun candle ditutup positif.`,
      'Pengesahan: tunggu penutupan di bawah low candle ini sebelum SELL.',
      3,
    ));
  }
  if (last.direction === 'bullish' && previous.direction === 'bearish' && last.close > previous.open && last.body > previous.body) {
    patterns.push(pattern(
      'bullish_engulfing',
      'Bullish Engulfing',
      'bullish',
      `Candle menaik ${round(last.body)} menutup badan candle jatuh sebelumnya ${round(previous.body)} dan ditutup atas ${round(previous.open)}: tekanan beli mengatasi jualan sebelum ini.`,
      'Pengesahan: kekalkan di atas high candle ini; jika tidak, isyarat terbatal.',
      4,
    ));
  }
  if (last.direction === 'bearish' && previous.direction === 'bullish' && last.close < previous.open && last.body > previous.body) {
    patterns.push(pattern(
      'bearish_engulfing',
      'Bearish Engulfing',
      'bearish',
      `Candle jatuh ${round(last.body)} menutup badan candle naik sebelumnya ${round(previous.body)} dan ditutup bawah ${round(previous.open)}: tekanan jual mengatasi pembelian sebelum ini.`,
      'Pengesahan: kekalkan di bawah low candle ini; jika tidak, isyarat terbatal.',
      4,
    ));
  }
  if (previous.direction === 'bearish' && last.direction === 'bullish' && last.body < previous.body * 0.6 && last.close < previous.open && last.open >= previous.close) {
    patterns.push(pattern(
      'bullish_harami',
      'Bullish Harami',
      'bullish',
      `Badan kecil ${round(last.body)} berada dalam badan jual besar ${round(previous.body)}: momentum jual perlahan dan pembeli mula mengambil alih.`,
      'Pengesahan lebih lemah: tunggu candle naik berikutnya menembus high candle sebelumnya.',
      2,
    ));
  }
  if (previous.direction === 'bullish' && last.direction === 'bearish' && last.body < previous.body * 0.6 && last.close > previous.open && last.open <= previous.close) {
    patterns.push(pattern(
      'bearish_harami',
      'Bearish Harami',
      'bearish',
      `Badan kecil ${round(last.body)} berada dalam badan naik besar ${round(previous.body)}: momentum beli perlahan dan penjual mula masuk.`,
      'Pengesahan lebih lemah: tunggu candle jatuh berikutnya menembus low candle sebelumnya.',
      2,
    ));
  }
  if (ratio >= 0.85 && up <= last.body * 0.12 && down <= last.body * 0.12) {
    patterns.push(pattern(
      last.direction === 'bullish' ? 'bullish_marubozu' : 'bearish_marubozu',
      last.direction === 'bullish' ? 'Bullish Marubozu' : 'Bearish Marubozu',
      last.direction === 'bullish' ? 'bullish' : 'bearish',
      `Badan hampir penuh ${round(last.body)} dengan sumbu sangat pendek: ${last.direction === 'bullish' ? 'pembeli mengawal dari open hingga close' : 'penjual mengawal dari open hingga close'}.`,
      'Pengesahan: arah cenderung berterusan jika candle seterusnya tidak berbalik.',
      2,
    ));
  }
  const lastThree = candles.slice(-3);
  if (lastThree.every(item => item.direction === 'bullish') && lastThree[2].close > lastThree[1].close && lastThree[1].close > lastThree[0].close) {
    patterns.push(pattern(
      'three_white_soldiers',
      'Three White Soldiers',
      'bullish',
      'Tiga candle naik berturut dengan close semakin tinggi: pembeli konsisten dan struktur kenaikan kukuh.',
      'Pengesahan: waspadai candle doji atau jatuh selepas ini sebagai tanda penat.',
      3,
    ));
  }
  if (lastThree.every(item => item.direction === 'bearish') && lastThree[2].close < lastThree[1].close && lastThree[1].close < lastThree[0].close) {
    patterns.push(pattern(
      'three_black_crows',
      'Three Black Crows',
      'bearish',
      'Tiga candle jatuh berturut dengan close semakin rendah: penjual konsisten dan struktur penurunan kukuh.',
      'Pengesahan: waspadai doji atau candle naik kuat sebagai tanda penat.',
      3,
    ));
  }

  patterns.sort((a, b) => b.priority - a.priority || a.id.localeCompare(b.id));
  const lead = patterns[0] || null;
  const action = lead?.bias === 'bullish' ? 'BUY' : lead?.bias === 'bearish' ? 'SELL' : 'NO TRADE';
  const signal = lead
    ? {
      action,
      bias: lead.bias,
      confidence: lead.priority >= 4 ? 'high' : lead.priority >= 3 ? 'medium' : 'low',
      pattern: lead.id,
      label: lead.label,
      reason: lead.confirmation,
      paperOnly: true,
      educational: true,
      signature: `${symbol}:${timeframe}:${action}:${lead.id}`,
    }
    : neutralSignal(symbol, timeframe, 'Tiada corak klasik yang cukup kuat pada candle terakhir. Tunggu pengesahan struktur.');

  return {
    symbol,
    timeframe,
    insufficient: false,
    lastClose: last.close,
    trend,
    lastCandle: {
      open: last.open,
      high: last.high,
      low: last.low,
      close: last.close,
      body: last.body,
      upperWick: round(up),
      lowerWick: round(down),
      direction: last.direction,
    },
    patterns,
    signal,
    summary: `${signal.label} pada ${symbol || 'simbol'} ${timeframe || 'timeframe'}: ${signal.action} (${signal.confidence}).`,
    candles: candles.slice(-30),
  };
}

export function explainCandlePatterns(result) {
  if (!result || result.insufficient) {
    return 'Data carta tidak mencukupi untuk membaca candle. Sediakan sekurang-kurangnya tiga titik harga.';
  }
  const symbol = result.symbol || 'simbol';
  const timeframe = result.timeframe || 'timeframe';
  const candle = result.lastCandle;
  const lines = [
    `Pembacaan candle ${symbol} (${timeframe}) — close ${result.lastClose}.`,
    `Badan ${candle.body}, sumbu atas ${candle.upperWick}, sumbu bawah ${candle.lowerWick}; aliran tiga candle terakhir: ${result.trend}.`,
  ];
  if (result.patterns.length) {
    result.patterns.forEach((item, index) => {
      lines.push(`${index + 1}. ${item.label}: ${item.explanation} ${item.confirmation}`);
    });
  } else {
    lines.push('Tiada corak klasik yang jelas. Badan dan sumbu tidak memberikan bukti arah yang mencukupi.');
  }
  lines.push(`Keputusan isyarat: ${result.signal.action} · keyakinan ${result.signal.confidence}. ${result.signal.reason}`);
  if (!focusSymbols.includes(symbol.toUpperCase())) {
    lines.push(`${symbol} di luar fokus XAU/USD dan DXY; pembacaan ini pendidikan sahaja.`);
  }
  lines.push('Ini bukan order. Sahkan dengan trend, SMA/RSI/ATR dan gate risiko sebelum sebarang keputusan paper.');
  return lines.join('\n');
}
