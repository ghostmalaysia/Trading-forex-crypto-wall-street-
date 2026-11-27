const MARKET = [
  { symbol: 'EUR/USD', market: 'Forex', price: 1.0842, change: 0.42, history: seed(1.0842, 0.0008) },
  { symbol: 'GBP/USD', market: 'Forex', price: 1.2735, change: -0.18, history: seed(1.2735, 0.0011) },
  { symbol: 'BTC/USD', market: 'Crypto', price: 68420, change: 1.85, history: seed(68420, 220) },
  { symbol: 'ETH/USD', market: 'Crypto', price: 3825, change: 2.14, history: seed(3825, 18) },
  { symbol: 'XAU/USD', market: 'Gold', price: 2342.5, change: 0.63, history: seed(2342.5, 4.2) },
  { symbol: 'DXY', market: 'USD Index', price: 104.28, change: -0.24, history: seed(104.28, 0.28) },
  { symbol: 'AAPL.US', market: 'Stocks', price: 192.4, change: 0.31, history: seed(192.4, 1.4) },
  { symbol: 'NVDA.US', market: 'Stocks', price: 120.8, change: -0.22, history: seed(120.8, 1.8) },
];
MARKET.forEach(m => { m.referencePrice = m.price / (1 + m.change / 100); });

const NEWS = [
  { title: 'Dollar steadies as traders await inflation data', meta: 'Forex • 12 min ago • Reuters-style mock' },
  { title: 'Bitcoin pushes higher on renewed ETF inflows', meta: 'Crypto • 28 min ago • Market Wire mock' },
  { title: 'Wall Street futures mixed ahead of earnings', meta: 'Stocks • 45 min ago • Street Brief mock' },
  { title: 'Gold holds gains amid rate-cut expectations', meta: 'Commodities • 1h ago • Macro Desk mock' },
  { title: 'AI market monitors flag volatility in tech indices', meta: 'AI • 1h ago • System Insight mock' },
];

const CALENDAR = [
  { date: '2026-11-27T13:30:00Z', title: 'US Core PCE Price Index (MoM)', impact: 'high', tags: 'USD • Gold' },
  { date: '2026-11-27T15:00:00Z', title: 'Federal Reserve Chair remarks', impact: 'medium', tags: 'USD • Gold' },
  { date: '2026-12-02T15:00:00Z', title: 'ISM Manufacturing PMI', impact: 'medium', tags: 'USD' },
  { date: '2026-12-04T13:30:00Z', title: 'US Nonfarm Payrolls', impact: 'high', tags: 'USD • Gold' },
  { date: '2026-12-10T13:30:00Z', title: 'US CPI (YoY)', impact: 'high', tags: 'USD • Gold' },
  { date: '2026-12-16T19:00:00Z', title: 'FOMC Statement and Dot Plot', impact: 'high', tags: 'USD • Gold' },
];

const FOCUS = ['XAU/USD', 'DXY'];
const state = {
  selected: 'XAU/USD', timeframe: '1D', userKey: null, memoryReady: false, provider: 'mock', providerDetail: '',
  configEditing: false, lessons: [], history: [], currentPlan: null, aiProvider: 'local', aiModel: 'rules', marketProvider: 'mock', alerts: [],
  chartType: 'candle', drawTool: 'cursor', indicators: { ma20: true, ma50: true, bb: false, rsi: false, macd: false },
  viewCount: null, viewOffset: 0, crosshair: null, drawings: [], pendingTrend: null, panStart: null, chartScale: null,
};
const $ = (id) => document.getElementById(id);

function seed(base, vol) {
  let v = base;
  const values = Array.from({ length: 48 }, (_, i) => {
    v += (Math.sin(i / 4) + (Math.random() - 0.5)) * vol;
    return +v.toFixed(base > 100 ? 2 : 5);
  });
  values[values.length - 1] = base;
  return values;
}

function fmtPrice(n) { return n > 100 ? n.toLocaleString(undefined, { maximumFractionDigits: 2 }) : n.toFixed(5); }
function fmtChange(n) { const s = n > 0 ? '+' : ''; return `${s}${n.toFixed(2)}%`; }
function escapeHtml(value) { return String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[ch])); }

function current() { return MARKET.find(m => m.symbol === state.selected) || MARKET[0]; }

function renderStats() {
  const c = current();
  const gainers = MARKET.filter(m => m.change > 0).length;
  const avg = MARKET.reduce((a, m) => a + m.change, 0) / MARKET.length;
  const cards = [
    { label: 'Selected Asset', value: c.symbol, delta: `${c.market} • ${fmtPrice(c.price)}`, cls: '' },
    { label: '24h Change', value: fmtChange(c.change), delta: c.change >= 0 ? 'Up vs previous close' : 'Down vs previous close', cls: c.change >= 0 ? 'up' : 'down' },
    { label: 'Market Breadth', value: `${gainers}/${MARKET.length}`, delta: 'Assets in positive territory', cls: 'up' },
    { label: 'Avg. Move', value: fmtChange(avg), delta: 'Across tracked watchlist', cls: avg >= 0 ? 'up' : 'down' },
  ];
  $('stats').innerHTML = cards.map(c => `<div class="stat"><div class="label">${c.label}</div><div class="value ${c.cls}">${c.value}</div><div class="delta ${c.cls}">${c.delta}</div></div>`).join('');
  const feedLive = state.provider === 'longbridge' || state.marketProvider === 'live' || state.marketProvider === 'partial';
  const feedLabel = state.provider === 'longbridge'
    ? 'Live quotes • Longbridge'
    : state.marketProvider === 'live'
      ? 'Live quotes • XAU/USD + DXY feed'
      : state.marketProvider === 'partial'
        ? 'Partial live feed • some symbols simulated'
        : `Mock data${state.providerDetail ? ` • ${state.providerDetail}` : ' • no live provider connected'}`;
  const status = document.querySelector('.sidebar-card small');
  if (status) status.textContent = feedLabel;
  const dot = document.querySelector('.sidebar-card .dot');
  if (dot) dot.classList.toggle('offline', !feedLive);
  const barProvider = $('statusProvider');
  if (barProvider) barProvider.textContent = feedLive ? (state.provider === 'longbridge' ? 'LIVE LONGBRIDGE' : `LIVE ${state.marketProvider.toUpperCase()}`) : 'SIMULATED';
  const barDot = $('statusDot');
  if (barDot) barDot.classList.toggle('offline', !feedLive);
}

function renderTicker() {
  $('ticker').innerHTML = MARKET.map(m => `
    <div class="ticker-item"><span class="ticker-symbol">${m.symbol}</span><span class="ticker-price">${fmtPrice(m.price)}</span><span class="ticker-change ${m.change >= 0 ? 'up' : 'down'}">${fmtChange(m.change)}</span></div>
  `).join('');
}

function renderWatchlist() {
  $('watchlistBody').innerHTML = MARKET.map(m => `
    <tr class="${m.symbol === state.selected ? 'active' : ''}" data-symbol="${m.symbol}" tabindex="0" aria-label="Show ${m.symbol} chart">
      <td>${m.symbol}</td>
      <td>${fmtPrice(m.price)}</td>
      <td class="${m.change >= 0 ? 'up' : 'down'}">${fmtChange(m.change)}</td>
      <td><span class="market-tag">${m.market}</span>${FOCUS.includes(m.symbol) ? ' <span class="badge live">AI</span>' : ''}</td>
    </tr>`).join('');
  document.querySelectorAll('#watchlistBody tr').forEach(tr => {
    const selectSymbol = () => {
      state.selected = tr.dataset.symbol;
      $('symbolSelect').value = state.selected;
      resetPlan();
      resetChartView();
      renderAll();
    };
    tr.addEventListener('click', selectSymbol);
    tr.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); selectSymbol(); }
    });
  });
}

function renderNews() {
  $('newsList').innerHTML = NEWS.map(n => {
    const tag = n.meta.split('•')[0].trim();
    return `<div class="news-item"><h4>${n.title}</h4><p><span class="news-tag">${tag}</span>${n.meta}</p></div>`;
  }).join('');
}

function renderControls() {
  const sel = $('symbolSelect');
  sel.innerHTML = MARKET.map(m => `<option value="${m.symbol}">${m.symbol} (${m.market})</option>`).join('');
  sel.value = state.selected;
}

function seriesForTimeframe(item) {
  const map = { '1H': item.history.slice(-24), '4H': item.history.slice(-36), '1D': item.history };
  return map[state.timeframe] || item.history;
}

function renderCalendar() {
  $('calendarList').innerHTML = CALENDAR.map(event => {
    const date = new Date(event.date);
    const stamp = date.toLocaleString(undefined, { month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'UTC' });
    return `<div class="calendar-item ${event.impact}">
      <span class="calendar-time">${stamp}</span>
      <span class="calendar-title">${escapeHtml(event.title)}<small>${escapeHtml(event.tags)}</small></span>
      <span class="calendar-impact">${event.impact}</span>
    </div>`;
  }).join('');
}

async function loadAlerts() {
  state.alerts = [];
  if (!window.SupabaseMemory?.enabled || !state.userKey) return;
  try {
    const result = await window.SupabaseMemory.loadAlerts(50);
    if (result.ok && result.data?.length) {
      state.alerts = result.data.map(row => ({
        id: row.id,
        symbol: row.symbol,
        condition: row.condition,
        threshold: Number(row.threshold),
        active: row.active !== false,
        triggered: !!row.triggered_at,
        triggeredAt: row.triggered_at || null,
      }));
    }
  } catch { setAuthStatus('Alerts could not be loaded; check Supabase policies.'); }
}

function renderAlerts() {
  const list = $('alertList');
  const activeCount = state.alerts.filter(alert => alert.active && !alert.triggered).length;
  $('alertCount').textContent = `${activeCount} active`;
  if (!state.alerts.length) {
    list.innerHTML = '<div class="alert-empty">Tiada alert. Tambah untuk XAU/USD atau DXY.</div>';
    return;
  }
  list.innerHTML = state.alerts.map(alert => `
    <div class="alert-item ${alert.triggered ? 'triggered' : ''}">
      <span>${escapeHtml(alert.symbol)} ${alert.condition === '>=' ? '≥' : '≤'} ${fmtPrice(Number(alert.threshold))}${alert.triggered ? ' ✓' : ''}</span>
      <span>${alert.triggered ? 'hit' : FOCUS.includes(alert.symbol) ? 'armed' : 'off-focus'}</span>
      <button type="button" data-alert-id="${escapeHtml(alert.id || '')}">del</button>
    </div>`).join('');
  list.querySelectorAll('button[data-alert-id]').forEach(button => button.addEventListener('click', async () => {
    const id = button.dataset.alertId;
    state.alerts = state.alerts.filter(alert => String(alert.id) !== id);
    renderAlerts();
    if (window.SupabaseMemory?.enabled && id) {
      try { await window.SupabaseMemory.deleteAlert(id); }
      catch { setAuthStatus('Alert removed locally; cloud delete failed.'); }
    }
  }));
}

async function addAlert(event) {
  event.preventDefault();
  const symbol = $('alertSymbol').value;
  const condition = $('alertCondition').value;
  const threshold = Number($('alertThreshold').value);
  if (!FOCUS.includes(symbol) || !Number.isFinite(threshold) || threshold <= 0) return;
  const alert = { id: `local-${Date.now()}`, symbol, condition, threshold, active: true, triggered: false, triggeredAt: null };
  state.alerts.unshift(alert);
  $('alertThreshold').value = '';
  renderAlerts();
  audit('alert_created', 'alert', { symbol, condition, threshold });
  if (window.SupabaseMemory?.enabled) {
    try {
      const result = await window.SupabaseMemory.saveAlert(alert);
      if (result?.data?.[0]?.id) alert.id = result.data[0].id;
      renderAlerts();
    } catch { setAuthStatus('Alert saved locally; cloud save failed.'); }
  }
}

let alertToastTimer;
function showAlertToast(message) {
  const el = $('alertToast');
  el.textContent = message;
  el.hidden = false;
  clearTimeout(alertToastTimer);
  alertToastTimer = setTimeout(() => { el.hidden = true; }, 6000);
}

function checkAlerts() {
  const triggered = state.alerts.filter(alert => {
    if (!alert.active || alert.triggered || !FOCUS.includes(alert.symbol)) return false;
    const item = MARKET.find(m => m.symbol === alert.symbol);
    if (!item) return false;
    return alert.condition === '>=' ? item.price >= alert.threshold : item.price <= alert.threshold;
  });
  if (!triggered.length) return;
  triggered.forEach(alert => {
    alert.triggered = true;
    alert.active = false;
    alert.triggeredAt = new Date().toISOString();
    showAlertToast(`${alert.symbol} ${alert.condition === '>=' ? '≥' : '≤'} ${fmtPrice(alert.threshold)} — alert triggered. No order placed.`);
    audit('alert_triggered', 'alert', { symbol: alert.symbol, condition: alert.condition, threshold: alert.threshold, price: MARKET.find(m => m.symbol === alert.symbol)?.price });
    if (window.SupabaseMemory?.enabled && alert.id && !String(alert.id).startsWith('local-')) {
      window.SupabaseMemory.triggerAlert(alert.id).catch(() => {});
    }
  });
  renderAlerts();
}

function rsiSeries(values, period = 14) {
  const result = Array(values.length).fill(null);
  if (values.length <= period) return result;
  let gains = 0;
  let losses = 0;
  for (let i = 1; i <= period; i++) {
    const diff = values[i] - values[i - 1];
    if (diff >= 0) gains += diff; else losses -= diff;
  }
  let avgGain = gains / period;
  let avgLoss = losses / period;
  result[period] = avgLoss === 0 ? 100 : +(100 - 100 / (1 + avgGain / avgLoss)).toFixed(2);
  for (let i = period + 1; i < values.length; i++) {
    const diff = values[i] - values[i - 1];
    avgGain = (avgGain * (period - 1) + (diff > 0 ? diff : 0)) / period;
    avgLoss = (avgLoss * (period - 1) + (diff < 0 ? -diff : 0)) / period;
    result[i] = avgLoss === 0 ? 100 : +(100 - 100 / (1 + avgGain / avgLoss)).toFixed(2);
  }
  return result;
}

function movingAverage(values, period, index) {
  if (index < period - 1) return null;
  let sum = 0;
  for (let i = index - period + 1; i <= index; i++) sum += values[i];
  return sum / period;
}

function emaSeries(values, period) {
  const result = Array(values.length).fill(null);
  if (values.length < period) return result;
  const multiplier = 2 / (period + 1);
  let seed = 0;
  for (let i = 0; i < period; i++) seed += values[i];
  let ema = seed / period;
  result[period - 1] = ema;
  for (let i = period; i < values.length; i++) {
    ema = values[i] * multiplier + ema * (1 - multiplier);
    result[i] = ema;
  }
  return result;
}

function bollingerBand(values, period, index, deviations = 2) {
  if (index < period - 1) return null;
  const mean = movingAverage(values, period, index);
  let variance = 0;
  for (let i = index - period + 1; i <= index; i++) variance += (values[i] - mean) ** 2;
  const sd = Math.sqrt(variance / period);
  return { upper: mean + deviations * sd, lower: mean - deviations * sd };
}

function resetChartView() {
  state.viewCount = null;
  state.viewOffset = 0;
  state.crosshair = null;
  state.drawings = [];
  state.pendingTrend = null;
}

function drawChart() {
  const c = current();
  const all = seriesForTimeframe(c);
  if (all.length < 2) return;
  const total = all.length;
  const count = Math.max(10, Math.min(state.viewCount || total, total));
  const end = Math.max(count, total - state.viewOffset);
  const start = Math.max(0, end - count);
  const data = all.slice(start, end);
  const rawLow = Math.min(...data);
  const rawHigh = Math.max(...data);
  const span = rawHigh - rawLow || Math.max(Math.abs(rawHigh) * 0.01, 1);
  const lo = rawLow - span * 0.08;
  const hi = rawHigh + span * 0.08;

  const canvas = $('priceChart');
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  const cssW = canvas.clientWidth || 600;
  const cssH = 320;
  canvas.width = Math.floor(cssW * dpr); canvas.height = Math.floor(cssH * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, cssW, cssH);

  const pad = { l: 50, r: 14, t: 16, x: 0 };
  const paneCount = (state.indicators.rsi ? 1 : 0) + (state.indicators.macd ? 1 : 0);
  const mainBottom = cssH - 26 - paneCount * 78;
  const plotW = cssW - pad.l - pad.r;
  const plotH = mainBottom - pad.t;
  const x = i => pad.l + (i / (data.length - 1)) * plotW;
  const y = v => pad.t + (1 - (v - lo) / (hi - lo)) * plotH;
  state.chartScale = { pad, cssW, cssH, mainBottom, lo, hi, plotW, plotH, start, end, count };

  ctx.strokeStyle = '#162237'; ctx.lineWidth = 1; ctx.setLineDash([]);
  for (let i = 0; i < 5; i++) {
    const gy = pad.t + (i / 4) * plotH;
    ctx.beginPath(); ctx.moveTo(pad.l, gy); ctx.lineTo(cssW - pad.r, gy); ctx.stroke();
    const val = hi - (i / 4) * (hi - lo);
    ctx.fillStyle = '#7589a5'; ctx.font = '10px monospace';
    ctx.fillText(c.price > 100 ? val.toFixed(0) : val.toFixed(4), 5, gy + 4);
  }

  const deltas = data.map((v, i) => Math.abs(v - (i ? data[i - 1] : v)));
  const maxDelta = Math.max(...deltas) || 1;
  const band = plotW / data.length;
  deltas.forEach((delta, i) => {
    const h = (delta / maxDelta) * 26;
    ctx.fillStyle = data[i] >= (i ? data[i - 1] : data[i]) ? 'rgba(0,214,143,.16)' : 'rgba(255,77,94,.16)';
    ctx.fillRect(x(i) - Math.max(1, band * 0.3), mainBottom - h, Math.max(2, band * 0.6), h);
  });

  if (state.chartType === 'candle') {
    const bodyW = Math.max(2, Math.min(11, band * 0.62));
    data.forEach((close, i) => {
      const open = i ? data[i - 1] : close;
      const wick = Math.max(Math.abs(close - open) * 0.4, span * 0.012);
      const up = close >= open;
      ctx.strokeStyle = up ? '#00d68f' : '#ff4d5e';
      ctx.fillStyle = up ? '#00d68f' : '#ff4d5e';
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(x(i), y(Math.max(open, close) + wick)); ctx.lineTo(x(i), y(Math.min(open, close) - wick)); ctx.stroke();
      const top = y(Math.max(open, close));
      const height = Math.max(1, Math.abs(y(open) - y(close)));
      ctx.fillRect(x(i) - bodyW / 2, top, bodyW, height);
    });
  } else {
    ctx.beginPath();
    data.forEach((v, i) => i ? ctx.lineTo(x(i), y(v)) : ctx.moveTo(x(i), y(v)));
    ctx.strokeStyle = c.change >= 0 ? '#00d68f' : '#ff4d5e'; ctx.lineWidth = 2; ctx.stroke();
    const grad = ctx.createLinearGradient(0, pad.t, 0, mainBottom);
    grad.addColorStop(0, c.change >= 0 ? 'rgba(0,214,143,.22)' : 'rgba(255,107,107,.2)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.lineTo(x(data.length - 1), mainBottom); ctx.lineTo(x(0), mainBottom); ctx.closePath();
    ctx.fillStyle = grad; ctx.fill();
  }

  const drawMa = period => {
    ctx.beginPath();
    let started = false;
    data.forEach((_, i) => {
      const value = movingAverage(all, period, start + i);
      if (value == null) return;
      const px = x(i), py = y(value);
      if (started) ctx.lineTo(px, py); else ctx.moveTo(px, py);
      started = true;
    });
    ctx.lineWidth = 1.2; ctx.stroke();
  };
  if (state.indicators.ma20) { ctx.strokeStyle = '#ffb020'; drawMa(20); }
  if (state.indicators.ma50) { ctx.strokeStyle = '#22d3ee'; drawMa(50); }

  if (state.indicators.bb) {
    ctx.setLineDash([3, 3]);
    ctx.strokeStyle = '#a78bfa';
    ['upper', 'lower'].forEach(side => {
      ctx.beginPath();
      let bbStarted = false;
      data.forEach((_, i) => {
        const band = bollingerBand(all, 20, start + i);
        if (!band) return;
        const px = x(i), py = y(band[side]);
        if (bbStarted) ctx.lineTo(px, py); else ctx.moveTo(px, py);
        bbStarted = true;
      });
      ctx.lineWidth = 1; ctx.stroke();
    });
    ctx.setLineDash([]);
  }

  ctx.setLineDash([4, 3]);
  state.drawings.forEach(drawing => {
    if (drawing.type === 'hline') {
      const py = y(drawing.price);
      if (py < pad.t || py > mainBottom) return;
      ctx.strokeStyle = '#a78bfa'; ctx.beginPath(); ctx.moveTo(pad.l, py); ctx.lineTo(cssW - pad.r, py); ctx.stroke();
      ctx.setLineDash([]); ctx.fillStyle = '#a78bfa'; ctx.font = '9px monospace';
      ctx.fillText(fmtPrice(drawing.price), cssW - pad.r - 48, py - 4); ctx.setLineDash([4, 3]);
    }
    if (drawing.type === 'trend') {
      ctx.strokeStyle = '#f5c451';
      ctx.beginPath();
      ctx.moveTo(pad.l + drawing.x1Ratio * plotW, y(drawing.price1));
      ctx.lineTo(pad.l + drawing.x2Ratio * plotW, y(drawing.price2));
      ctx.stroke();
    }
  });
  if (state.pendingTrend) {
    ctx.fillStyle = '#f5c451';
    ctx.beginPath(); ctx.arc(pad.l + state.pendingTrend.xRatio * plotW, y(state.pendingTrend.price), 4, 0, Math.PI * 2); ctx.fill();
  }

  if (state.crosshair) {
    const { px, py } = state.crosshair;
    if (px >= pad.l && px <= cssW - pad.r && py >= pad.t && py <= mainBottom) {
      ctx.strokeStyle = '#6b85a8'; ctx.setLineDash([3, 3]);
      ctx.beginPath(); ctx.moveTo(px, pad.t); ctx.lineTo(px, mainBottom); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(pad.l, py); ctx.lineTo(cssW - pad.r, py); ctx.stroke();
      ctx.setLineDash([]);
      const price = hi - ((py - pad.t) / plotH) * (hi - lo);
      ctx.fillStyle = '#111d2e'; ctx.fillRect(cssW - pad.r + 2, py - 8, pad.r - 2, 16);
      ctx.fillStyle = '#dce6f5'; ctx.font = '9px monospace';
      ctx.fillText(c.price > 100 ? price.toFixed(0) : price.toFixed(4), cssW - pad.r + 4, py + 3);
      const index = start + Math.round(((px - pad.l) / plotW) * (data.length - 1));
      ctx.fillStyle = '#111d2e'; ctx.fillRect(px - 16, mainBottom + 1, 32, 14);
      ctx.fillStyle = '#dce6f5'; ctx.fillText(`T-${index}`, px - 14, mainBottom + 11);
    }
  }
  ctx.setLineDash([]);

  let paneTop = mainBottom + 8;
  if (state.indicators.rsi) {
    const rsiTop = paneTop;
    const rsiHeight = 60;
    ctx.fillStyle = '#080e18'; ctx.fillRect(pad.l, rsiTop, plotW, rsiHeight);
    [30, 50, 70].forEach(level => {
      const ly = rsiTop + rsiHeight - (level / 100) * rsiHeight;
      ctx.strokeStyle = level === 50 ? '#26364e' : '#3a2a2e';
      ctx.setLineDash(level === 50 ? [] : [3, 3]);
      ctx.beginPath(); ctx.moveTo(pad.l, ly); ctx.lineTo(cssW - pad.r, ly); ctx.stroke();
      ctx.setLineDash([]); ctx.fillStyle = '#4a5f7d'; ctx.font = '9px monospace'; ctx.fillText(String(level), 18, ly + 3);
    });
    const rsiValues = rsiSeries(all);
    ctx.beginPath();
    let rsiStarted = false;
    data.forEach((_, i) => {
      const value = rsiValues[start + i];
      if (value == null) return;
      const px = x(i), py = rsiTop + rsiHeight - (value / 100) * rsiHeight;
      if (rsiStarted) ctx.lineTo(px, py); else ctx.moveTo(px, py);
      rsiStarted = true;
    });
    ctx.strokeStyle = '#a78bfa'; ctx.lineWidth = 1.3; ctx.stroke();
    ctx.fillStyle = '#7589a5'; ctx.font = '9px monospace'; ctx.fillText('RSI14', pad.l + 5, rsiTop + 11);
    paneTop += rsiHeight + 8;
  }

  if (state.indicators.macd) {
    const macdTop = paneTop;
    const macdHeight = 60;
    ctx.fillStyle = '#080e18'; ctx.fillRect(pad.l, macdTop, plotW, macdHeight);
    const fast = emaSeries(all, 12);
    const slow = emaSeries(all, 26);
    const macd = all.map((_, i) => fast[i] != null && slow[i] != null ? fast[i] - slow[i] : 0);
    const signal = emaSeries(macd, 9);
    const values = [];
    data.forEach((_, i) => {
      const idx = start + i;
      if (slow[idx] == null || signal[idx] == null) return;
      values.push(macd[idx], signal[idx]);
    });
    const maxAbs = Math.max(0.000001, ...values.map(Math.abs));
    const macdY = value => macdTop + macdHeight / 2 - (value / maxAbs) * (macdHeight / 2 - 4);
    const zero = macdTop + macdHeight / 2;
    ctx.strokeStyle = '#26364e'; ctx.setLineDash([]);
    ctx.beginPath(); ctx.moveTo(pad.l, zero); ctx.lineTo(cssW - pad.r, zero); ctx.stroke();
    data.forEach((_, i) => {
      const idx = start + i;
      if (slow[idx] == null || signal[idx] == null) return;
      const value = macd[idx] - signal[idx];
      ctx.fillStyle = value >= 0 ? 'rgba(0,214,143,.35)' : 'rgba(255,77,94,.35)';
      ctx.fillRect(x(i) - Math.max(1, band * 0.3), Math.min(zero, macdY(value)), Math.max(2, band * 0.6), Math.abs(macdY(value) - zero));
    });
    [[macd, '#22d3ee'], [signal, '#ffb020']].forEach(([series, color]) => {
      ctx.beginPath();
      let started = false;
      data.forEach((_, i) => {
        const idx = start + i;
        if (slow[idx] == null || signal[idx] == null) return;
        const px = x(i), py = macdY(series[idx]);
        if (started) ctx.lineTo(px, py); else ctx.moveTo(px, py);
        started = true;
      });
      ctx.strokeStyle = color; ctx.lineWidth = 1.2; ctx.stroke();
    });
    ctx.fillStyle = '#7589a5'; ctx.font = '9px monospace'; ctx.fillText('MACD 12,26,9', pad.l + 5, macdTop + 11);
  }

  ctx.fillStyle = '#4a5f7d'; ctx.font = '9px monospace';
  const labelStep = Math.max(1, Math.floor(data.length / 6));
  for (let i = 0; i < data.length; i += labelStep) ctx.fillText(`T-${start + i}`, x(i) - 8, cssH - 6);

  const last = data[data.length - 1];
  ctx.fillStyle = '#22d3ee'; ctx.beginPath(); ctx.arc(x(data.length - 1), y(last), 3.5, 0, Math.PI * 2); ctx.fill();

  $('chartTitle').textContent = `${c.symbol} ${state.chartType === 'candle' ? 'Candlestick' : 'Price'} Chart (${state.timeframe})`;
  const badge = $('chartChange');
  badge.textContent = fmtChange(c.change);
  badge.style.color = c.change >= 0 ? '#9ff0bf' : '#ffb3b3';
  badge.style.background = c.change >= 0 ? 'rgba(46,204,113,.12)' : 'rgba(255,107,107,.12)';
  badge.style.borderColor = c.change >= 0 ? 'rgba(46,204,113,.25)' : 'rgba(255,107,107,.25)';
  const isLive = c.dataSource === 'longbridge' || c.dataSource === 'market';
  const source = c.dataSource === 'longbridge' ? 'Longbridge live quote' : c.dataSource === 'market' ? `Live feed • ${c.providerSymbol || c.symbol}` : 'Simulated data';
  const sourceEl = $('chartSource');
  if (sourceEl) { sourceEl.textContent = isLive ? 'LIVE' : 'SIM'; sourceEl.classList.toggle('live', isLive); }
  $('chartMeta').innerHTML = `<span>Last: <strong>${fmtPrice(c.price)}</strong></span><span>High: ${fmtPrice(rawHigh)}</span><span>Low: ${fmtPrice(rawLow)}</span><span>Bars: ${count}</span><span>Source: ${source}</span>`;
}

function bindChartTools() {
  document.querySelectorAll('[data-chart-type]').forEach(btn => btn.addEventListener('click', () => {
    state.chartType = btn.dataset.chartType;
    document.querySelectorAll('[data-chart-type]').forEach(item => item.classList.toggle('active', item === btn));
    drawChart();
  }));
  document.querySelectorAll('[data-tool]').forEach(btn => btn.addEventListener('click', () => {
    state.drawTool = btn.dataset.tool;
    state.pendingTrend = null;
    document.querySelectorAll('[data-tool]').forEach(item => item.classList.toggle('active', item === btn));
  }));
  document.querySelectorAll('[data-indicator]').forEach(btn => btn.addEventListener('click', () => {
    const key = btn.dataset.indicator;
    state.indicators[key] = !state.indicators[key];
    btn.classList.toggle('active', state.indicators[key]);
    drawChart();
  }));

  const canvas = $('priceChart');
  let dragMoved = false;
  canvas.addEventListener('mousemove', event => {
    const rect = canvas.getBoundingClientRect();
    state.crosshair = { px: event.clientX - rect.left, py: event.clientY - rect.top };
    if (state.panStart) {
      const dx = event.clientX - state.panStart.x;
      if (Math.abs(dx) > 3) dragMoved = true;
      const all = seriesForTimeframe(current());
      const maxOffset = Math.max(0, all.length - 20);
      state.viewOffset = Math.max(0, Math.min(maxOffset, state.panStart.offset + Math.round(dx / 6)));
    }
    drawChart();
  });
  canvas.addEventListener('mouseleave', () => { state.crosshair = null; drawChart(); });
  canvas.addEventListener('mousedown', event => { state.panStart = { x: event.clientX, offset: state.viewOffset }; dragMoved = false; });
  window.addEventListener('mouseup', () => { state.panStart = null; });
  canvas.addEventListener('wheel', event => {
    event.preventDefault();
    const all = seriesForTimeframe(current());
    const next = (state.viewCount || all.length) + (event.deltaY > 0 ? 5 : -5);
    state.viewCount = Math.max(20, Math.min(all.length, next));
    drawChart();
  }, { passive: false });
  canvas.addEventListener('click', event => {
    if (dragMoved) { dragMoved = false; return; }
    const scale = state.chartScale;
    if (!scale || state.drawTool === 'cursor') return;
    const rect = canvas.getBoundingClientRect();
    const px = event.clientX - rect.left;
    const py = event.clientY - rect.top;
    if (py > scale.mainBottom || px < scale.pad.l || px > scale.cssW - scale.pad.r) return;
    const price = scale.hi - ((py - scale.pad.t) / scale.plotH) * (scale.hi - scale.lo);
    const xRatio = Math.max(0, Math.min(1, (px - scale.pad.l) / scale.plotW));
    if (state.drawTool === 'hline') state.drawings.push({ type: 'hline', price });
    if (state.drawTool === 'trend') {
      if (!state.pendingTrend) state.pendingTrend = { xRatio, price };
      else {
        state.drawings.push({ type: 'trend', ...state.pendingTrend, x2Ratio: xRatio, price2: price });
        state.pendingTrend = null;
      }
    }
    drawChart();
  });
}

function aiReply(text) {
  const t = text.toLowerCase();
  const c = current();
  if (!FOCUS.includes(c.symbol)) {
    return `Fokus saya hanya XAU/USD dan DXY. Sila pilih salah satu daripada watchlist. ${c.symbol} di luar skop model ini.`;
  }
  if (t.includes('summary') || t.includes('market') || t.includes('analisis')) {
    const data = seriesForTimeframe(c);
    const sma = data.slice(-20).reduce((a, b) => a + b, 0) / Math.min(data.length, 20);
    return `Ringkasan ${c.symbol}: harga ${fmtPrice(c.price)} (${fmtChange(c.change)} 24h), SMA20 ${fmtPrice(sma)}. ${c.price > sma ? 'Harga di atas SMA20 (biasa bullish jangka pendek).' : 'Harga di bawah SMA20 (biasa bearish jangka pendek).'} Ini maklumat sahaja, bukan nasihat kewangan.`;
  }
  if (t.includes('risk') || t.includes('risiko')) {
    return `Risiko ${c.symbol}: pergerakan hari ini ${fmtChange(c.change)}. Gunakan saiz posisi kecil, stop-loss, dan maksimum 1% risiko setiap cadangan. Tiada execution; kelulusan manusia diperlukan.`;
  }
  if (t.includes('plan') || t.includes('cadangan')) {
    return `Saya boleh hasilkan cadangan berstruktur untuk ${c.symbol} melalui butang “AI Trade Plan”. Cadangan akan melalui gate risiko dan kelulusan manusia dalam mod paper sahaja.`;
  }
  return `Fokus saya XAU/USD (emas) dan USD/DXY. Tanya “analisis”, “risiko”, atau tekan “AI Trade Plan”. Balasan ini datang dari rules lokal kerana tiada model AI disambung.`;
}

function addMsg(role, text, messageIndex = null) {
  const el = document.createElement('div');
  el.className = `msg ${role}`;
  const body = document.createElement('div');
  body.className = 'msg-body';
  body.textContent = text;
  el.appendChild(body);
  if (role === 'ai' && messageIndex !== null) {
    const actions = document.createElement('div');
    actions.className = 'msg-actions';
    [[1, 'Helpful'], [-1, 'Not helpful']].forEach(([rating, label]) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = label;
      btn.dataset.messageIndex = String(messageIndex);
      btn.addEventListener('click', () => rateMessage(messageIndex, rating));
      actions.appendChild(btn);
    });
    el.appendChild(actions);
  }
  $('chatLog').appendChild(el);
  $('chatLog').scrollTop = $('chatLog').scrollHeight;
  return el;
}

function buildAIContext() {
  const c = current();
  return {
    selected: c.symbol,
    market: c.market,
    timeframe: state.timeframe,
    price: c.price,
    change: c.change,
    dataSource: c.dataSource || 'mock',
    chart: { symbol: c.symbol, timeframe: state.timeframe, series: seriesForTimeframe(c) },
    lessons: state.lessons.map(l => l.insight),
    history: state.history.slice(-4),
    preferences: { paperEquity: 10000 },
    risk: { dailyLossPct: 0, openPositions: 0 },
  };
}

async function askAI(message, mode = 'chat') {
  const response = await fetch('/api/ai', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, mode, context: buildAIContext() }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `AI request failed (${response.status})`);
  return data;
}

function renderPlan(data) {
  const plan = data.plan || {};
  const risk = data.risk || {};
  const analysis = data.analysis || {};
  const cell = (label, value) => `<div class="plan-cell"><span>${label}</span><strong>${value}</strong></div>`;
  const price = value => value == null ? '—' : fmtPrice(Number(value));
  const checks = (risk.checks || []).map(item => `<div class="risk-item ${item.pass ? '' : 'fail'}"><span>${escapeHtml(item.name)}</span><span>${escapeHtml(item.detail)}</span></div>`).join('');
  $('planBody').innerHTML = `
    <p>${escapeHtml(data.reply || '')}</p>
    <div class="plan-grid">
      ${cell('Symbol', escapeHtml(state.selected))}
      ${cell('Bias', escapeHtml(String(plan.bias || '—').toUpperCase()))}
      ${cell('Entry', price(plan.entry))}
      ${cell('Stop loss', price(plan.stopLoss))}
      ${cell('Take profit', price(plan.takeProfit))}
      ${cell('Risk', `${plan.riskPct ?? 0}% • ${plan.units ?? 0} units`)}
    </div>
    <p>${escapeHtml(plan.rationale || '')}</p>
    <p class="muted">RSI14 ${analysis.rsi14 ?? '—'} • trend ${escapeHtml(analysis.trend || '—')} • R:R ${risk.rewardRisk ?? '—'}</p>
    <div class="risk-list">${checks}</div>`;
  $('planStatus').textContent = risk.decision === 'blocked' ? 'BLOCKED' : 'PAPER APPROVAL';
  $('planStatus').classList.toggle('warn', risk.decision === 'blocked');
  $('planActions').hidden = false;
  $('approvePlanBtn').disabled = risk.decision === 'blocked';
  $('rejectPlanBtn').disabled = false;
}

async function refreshLessons() {
  if (!window.SupabaseMemory?.enabled || !state.userKey) return;
  try {
    const result = await window.SupabaseMemory.loadLessons(10);
    if (result.ok && result.data?.length) state.lessons = result.data.map(l => ({ insight: l.insight, rating: l.rating, createdAt: l.created_at }));
  } catch { setAuthStatus('AI learning could not be loaded; check Supabase policies.'); }
}

async function rateMessage(index, rating) {
  const item = state.history[index];
  if (!item || item.rated) return;
  item.rated = true;
  const insight = `${item.role}: ${item.content.slice(0, 240)}`;
  state.lessons.unshift({ insight, rating });
  state.lessons = state.lessons.slice(0, 20);
  audit('ai_feedback', 'lesson', { rating, role: item.role });
  if (window.SupabaseMemory?.enabled) {
    try { await window.SupabaseMemory.saveLesson(insight, 'feedback', rating); }
    catch { setAuthStatus('Feedback saved for this session; cloud learning could not be saved.'); }
  }
  setAuthStatus(rating > 0 ? 'Terima kasih — maklum balas disimpan untuk pembelajaran AI.' : 'Maklum balas negatif disimpan; AI akan elak corak ini.');
  const buttons = $('chatLog').querySelectorAll(`.msg-actions button[data-message-index="${index}"]`);
  buttons.forEach(btn => { btn.disabled = true; });
}

async function submitPlan() {
  const btn = $('planBtn');
  btn.disabled = true;
  $('planStatus').textContent = 'ANALYSING…';
  try {
    const data = await askAI('Bina cadangan paper trading untuk simbol ini berdasarkan graf semasa.', 'plan');
    state.currentPlan = data;
    renderPlan(data);
    audit('ai_plan_generated', 'plan', { symbol: state.selected, decision: data.risk?.decision, provider: data.provider });
    const index = state.history.push({ role: 'ai', content: data.reply || 'AI plan generated.' }) - 1;
    addMsg('ai', data.reply || 'AI plan generated.', index);
    if (window.SupabaseMemory?.enabled) saveChatMessage('ai', data.reply || 'AI plan generated.');
  } catch (error) {
    $('planStatus').textContent = 'ERROR';
    $('planBody').innerHTML = `<p class="down">${error.message}</p>`;
  } finally { btn.disabled = false; }
}

async function decidePlan(decision) {
  if (!state.currentPlan) return;
  const plan = {
    symbol: state.selected,
    timeframe: state.timeframe,
    proposal: state.currentPlan.plan || {},
    risk: state.currentPlan.risk || {},
    decision,
    decided_at: new Date().toISOString(),
  };
  $('planStatus').textContent = decision === 'approved' ? 'APPROVED (PAPER)' : 'REJECTED';
  $('planActions').hidden = true;
  state.history.push({ role: 'user', content: `Plan ${state.selected}: ${decision}. Tiada execution sebenar.` });
  addMsg('user', `Plan ${state.selected}: ${decision}. Tiada execution sebenar.`);
  audit('ai_plan_decided', 'plan', { symbol: state.selected, decision, provider: state.currentPlan?.provider });
  if (window.SupabaseMemory?.enabled) {
    try { await window.SupabaseMemory.savePlan(plan); }
    catch { setAuthStatus('Plan direkod dalam sesi; cloud audit tidak dapat disimpan.'); }
  }
}

async function initChat() {
  if (!$('chatLog').dataset.loaded) {
    $('chatLog').dataset.loaded = 'true';
    addMsg('ai', 'Fokus saya XAU/USD dan DXY. Saya boleh baca graf, beri analisis, dan hasilkan cadangan paper melalui gate risiko + kelulusan manusia. Ini bukan nasihat kewangan.');
    if (window.SupabaseMemory?.enabled) {
      try {
        const hist = await window.SupabaseMemory.loadChat(state.userKey, 20);
        if (hist.ok && hist.data?.length) {
          $('chatLog').innerHTML = '';
          hist.data.forEach(m => {
            const index = state.history.push({ role: m.role === 'user' ? 'user' : 'ai', content: m.content }) - 1;
            addMsg(m.role === 'user' ? 'user' : 'ai', m.content, m.role === 'ai' ? index : null);
          });
        }
      } catch { setAuthStatus('Signed in, but chat history could not be loaded. Check the Supabase migration and RLS policies.'); }
      await refreshLessons();
    }
  }
  if ($('chatForm').dataset.bound) return;
  $('chatForm').dataset.bound = 'true';
  $('chatForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const text = $('chatInput').value.trim();
    if (!text) return;
    $('chatInput').value = '';
    const userIndex = state.history.push({ role: 'user', content: text }) - 1;
    addMsg('user', text);
    if (window.SupabaseMemory?.enabled) saveChatMessage('user', text);
    try {
      const mode = /cadangan|plan|trade plan/i.test(text) ? 'plan' : 'chat';
      const data = await askAI(text, mode);
      if (mode === 'plan' && data.plan) {
        state.currentPlan = data;
        renderPlan(data);
        audit('ai_plan_generated', 'plan', { symbol: state.selected, decision: data.risk?.decision, provider: data.provider });
      }
      const aiIndex = state.history.push({ role: 'ai', content: data.reply }) - 1;
      addMsg('ai', data.reply, aiIndex);
      if (window.SupabaseMemory?.enabled) saveChatMessage('ai', data.reply);
    } catch (error) {
      const reply = `AI tidak dapat dihubungi (${error.message}). Fallback lokal: ${aiReply(text)}`;
      const aiIndex = state.history.push({ role: 'ai', content: reply }) - 1;
      addMsg('ai', reply, aiIndex);
    }
  });
}

function audit(action, entity, payload = {}) {
  if (!window.SupabaseMemory?.enabled || !state.userKey) return;
  window.SupabaseMemory.saveAudit(action, entity, payload).catch(() => {});
}

function setAuthStatus(message) {
  const status = $('authStatus');
  if (status) status.textContent = message;
}

function updateAuthUI() {
  const memory = window.SupabaseMemory;
  const configured = !!memory?.configured;
  const signedIn = !!memory?.enabled;
  const editing = !configured || state.configEditing;
  if (!configured) setAuthStatus('Cloud memory is off. Enter your Supabase URL and publishable key below.');
  else if (signedIn && !editing) setAuthStatus(`Signed in as ${memory.getUserEmail()}. Your cloud memory is private to this account.`);
  else if (signedIn) setAuthStatus('Signed in. Update Supabase settings below.');
  else if (!editing) setAuthStatus('Sign in or create an account to save private chat history and preferences.');
  $('configForm').hidden = !editing;
  $('configEditBtn').hidden = !configured || editing;
  $('authForm').hidden = !configured || signedIn || editing;
  $('signOutBtn').hidden = !signedIn || editing;
  $('configClearBtn').hidden = !configured;
}

function openConfig() {
  state.configEditing = true;
  const config = window.SupabaseMemory?.getConfig?.();
  if (config) $('configUrl').value = config.url;
  $('configKey').value = '';
  updateAuthUI();
  $('configUrl').focus();
}

async function applyConfigFromForm(withTest) {
  const memory = window.SupabaseMemory;
  if (!memory?.configure) return;
  const url = $('configUrl').value.trim();
  const anonKey = $('configKey').value.trim();
  if (!memory.configure({ url, anonKey })) {
    setAuthStatus('Enter a valid https:// Supabase URL and a publishable/anon key. service_role keys are not allowed.');
    return;
  }
  $('configKey').value = '';
  state.configEditing = false;
  updateAuthUI();
  if (withTest) {
    try {
      const result = await memory.testConnection();
      setAuthStatus(`Supabase connected${result.emailAuthEnabled ? '; email auth is enabled' : '; email auth appears disabled'}. Sign in to enable private memory.`);
    } catch (error) { setAuthStatus(`Settings saved, but connection test failed: ${error.message}`); }
  } else {
    setAuthStatus('Supabase settings saved. Restoring your session…');
  }
  await memory.restoreSession();
  state.userKey = memory.getUserKey();
  if (memory.enabled) await finishSignIn();
  else { updateAuthUI(); await initChat(); }
}

async function clearConfig() {
  const memory = window.SupabaseMemory;
  try { await memory?.signOut?.(); } catch {}
  memory?.clearConfig?.();
  state.userKey = null;
  state.configEditing = false;
  $('configUrl').value = '';
  $('configKey').value = '';
  setAuthStatus('Supabase settings cleared. Cloud memory is off.');
  updateAuthUI();
  await initChat();
}

async function saveChatMessage(role, content) {
  try {
    await window.SupabaseMemory.saveChat({ user_key: state.userKey, role, content, context: { symbol: state.selected, timeframe: state.timeframe } });
  } catch { setAuthStatus('Chat is visible in this session, but cloud memory could not be saved. Check the Supabase migration and RLS policies.'); }
}

async function finishSignIn() {
  state.userKey = window.SupabaseMemory.getUserKey();
  updateAuthUI();
  await initChat();
  await persistProfile();
  await loadAlerts();
  renderAlerts();
  try {
    await window.SupabaseMemory.saveWatchlist(MARKET.map(m => ({ user_key: state.userKey, symbol: m.symbol, market: m.market })));
  } catch { setAuthStatus('Signed in. Watchlist could not be synced; check the Supabase migration and RLS policies.'); }
}

async function authenticate(mode) {
  const email = $('authEmail').value.trim();
  const password = $('authPassword').value;
  const buttons = document.querySelectorAll('.auth-actions button');
  let statusMessage = '';
  buttons.forEach(button => { button.disabled = true; });
  setAuthStatus(mode === 'signup' ? 'Creating account…' : 'Signing in…');
  try {
    if (mode === 'signup') {
      const session = await window.SupabaseMemory.signUp(email, password);
      if (session) { $('authPassword').value = ''; await finishSignIn(); }
      else statusMessage = 'Account created. Check your email to confirm it, then sign in.';
    } else {
      await window.SupabaseMemory.signIn(email, password);
      $('authPassword').value = '';
      await finishSignIn();
    }
  } catch (error) { statusMessage = error.message || 'Authentication failed.'; }
  finally {
    buttons.forEach(button => { button.disabled = false; });
    updateAuthUI();
    if (statusMessage) setAuthStatus(statusMessage);
  }
}

function tickClock() {
  const now = new Date().toLocaleString();
  $('clock').textContent = now;
  $('statusClock').textContent = now;
  const hour = new Date().getHours();
  $('sessionBadge').textContent = hour < 8 ? 'Asia session' : hour < 16 ? 'London session' : hour < 22 ? 'New York session' : 'Extended hours';
}

async function checkAiStatus() {
  try {
    const response = await fetch('/api/health', { cache: 'no-store' });
    const data = await response.json();
    state.aiProvider = data.aiProvider || 'local';
    state.aiModel = data.aiModel || 'rules';
    $('statusAi').textContent = state.aiProvider === 'groq' ? `GROQ ${state.aiModel}` : 'LOCAL RULES';
  } catch { $('statusAi').textContent = 'LOCAL RULES'; }
}
function randomWalk() {
  MARKET.forEach(m => {
    if (m.dataSource === 'longbridge') return;
    const vol = m.symbol === 'DXY' ? 0.35 : m.price > 1000 ? 25 : m.price > 100 ? 8 : m.price > 10 ? 0.8 : 0.0009;
    const delta = (Math.random() - 0.5) * vol;
    m.price = +(m.price + delta).toFixed(m.price > 100 ? 2 : 5);
    m.change = +((m.price / m.referencePrice - 1) * 100).toFixed(2);
    m.history.push(m.price);
    if (m.history.length > 60) m.history.shift();
  });
}

async function refreshMarketData() {
  try {
    const response = await fetch('/api/market', { cache: 'no-store' });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || 'Market feed unavailable');
    state.marketProvider = payload.provider || 'mock';
    for (const item of payload.items || []) {
      const target = MARKET.find(m => m.symbol === item.symbol);
      if (!target || !Number.isFinite(item.price) || item.price <= 0) continue;
      target.price = item.price;
      if (Number.isFinite(item.previousClose) && item.previousClose > 0) {
        target.referencePrice = item.previousClose;
        target.change = +((target.price / target.referencePrice - 1) * 100).toFixed(2);
      }
      if (Array.isArray(item.series) && item.series.length > 2) {
        target.history = item.series.slice(-60);
      } else {
        target.history.push(target.price);
        if (target.history.length > 60) target.history.shift();
      }
      target.dataSource = 'market';
      target.providerSymbol = item.providerSymbol || null;
      target.feedLabel = item.label || null;
    }
  } catch {
    state.marketProvider = 'mock';
  }
  checkAlerts();
}

async function refreshLongbridgeQuotes() {
  const symbols = MARKET.filter(m => m.market === 'Stocks').map(m => m.symbol);
  try {
    const response = await fetch(`/api/quotes?symbols=${encodeURIComponent(symbols.join(','))}`, { cache: 'no-store' });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || 'Quote service unavailable');
    for (const quote of payload.quotes || []) {
      const item = MARKET.find(m => m.symbol === quote.symbol);
      if (!item || !Number.isFinite(quote.price)) continue;
      item.price = quote.price;
      if (Number.isFinite(quote.previousClose) && quote.previousClose > 0) {
        item.referencePrice = quote.previousClose;
        item.change = +((item.price / item.referencePrice - 1) * 100).toFixed(2);
      }
      item.dataSource = 'longbridge';
      item.history.push(item.price);
      if (item.history.length > 60) item.history.shift();
    }
    state.provider = MARKET.some(m => m.dataSource === 'longbridge') ? 'longbridge' : 'mock';
    state.providerDetail = state.provider === 'mock' ? 'waiting for a Longbridge quote' : '';
  } catch (error) {
    state.provider = MARKET.some(m => m.dataSource === 'longbridge') ? 'longbridge' : 'mock';
    state.providerDetail = state.provider === 'mock' ? 'start server.mjs and connect Longbridge to enable live quotes' : 'last Longbridge quote retained';
  }
  renderAll();
}

function resetPlan() {
  state.currentPlan = null;
  $('planStatus').textContent = 'Paper only';
  $('planStatus').classList.remove('warn');
  $('planBody').innerHTML = '<p class="muted">Tiada cadangan lagi. Pilih XAU/USD atau DXY, tekan “AI Trade Plan”.</p>';
  $('planActions').hidden = true;
  $('approvePlanBtn').disabled = false;
  $('rejectPlanBtn').disabled = false;
}

function renderAll() { renderStats(); renderTicker(); renderWatchlist(); renderNews(); renderCalendar(); drawChart(); }

async function persistProfile() {
  if (!window.SupabaseMemory?.enabled) return;
  try {
    await window.SupabaseMemory.saveProfile({
      user_key: state.userKey,
      preferences: { theme: 'dark', default_symbol: state.selected, timeframe: state.timeframe }
    });
  } catch { setAuthStatus('Signed in, but preferences could not be saved. Check the Supabase migration and RLS policies.'); }
}

function bind() {
  $('symbolSelect').addEventListener('change', async e => { state.selected = e.target.value; resetPlan(); resetChartView(); renderAll(); await persistProfile(); });
  $('timeframeSelect').addEventListener('change', async e => { state.timeframe = e.target.value; resetPlan(); resetChartView(); drawChart(); await persistProfile(); });
  $('refreshBtn').addEventListener('click', () => { randomWalk(); renderAll(); refreshLongbridgeQuotes(); refreshMarketData(); });
  $('planBtn').addEventListener('click', submitPlan);
  $('approvePlanBtn').addEventListener('click', () => decidePlan('approved'));
  $('rejectPlanBtn').addEventListener('click', () => decidePlan('rejected'));
  $('alertForm').addEventListener('submit', addAlert);
  $('configEditBtn').addEventListener('click', openConfig);
  $('configForm').addEventListener('submit', event => { event.preventDefault(); applyConfigFromForm(false); });
  $('configTestBtn').addEventListener('click', () => applyConfigFromForm(true));
  $('configClearBtn').addEventListener('click', clearConfig);
  $('authForm').addEventListener('submit', event => { event.preventDefault(); authenticate('signin'); });
  $('signUpBtn').addEventListener('click', () => {
    if ($('authForm').reportValidity()) authenticate('signup');
  });
  $('signOutBtn').addEventListener('click', async () => {
    try { await window.SupabaseMemory.signOut(); } catch {}
    state.userKey = null;
    state.alerts = [];
    renderAlerts();
    updateAuthUI();
    await initChat();
  });
  document.querySelectorAll('.nav a').forEach(link => link.addEventListener('click', () => {
    document.querySelectorAll('.nav a').forEach(item => item.classList.toggle('active', item === link));
  }));
  bindChartTools();
  window.addEventListener('resize', drawChart);
}

async function boot() {
  await window.SupabaseMemory?.restoreSession?.();
  state.userKey = window.SupabaseMemory?.getUserKey?.() || null;
  updateAuthUI();
  renderControls();
  bind();
  renderAll();
  tickClock();
  checkAiStatus();
  await initChat();
  await loadAlerts();
  renderAlerts();
  refreshMarketData();
  if (window.SupabaseMemory?.enabled) {
    state.memoryReady = true;
    await persistProfile();
    try {
      await window.SupabaseMemory.saveWatchlist(MARKET.map(m => ({ user_key: state.userKey, symbol: m.symbol, market: m.market })));
    } catch { setAuthStatus('Signed in, but watchlist sync failed. Check the Supabase migration and RLS policies.'); }
  }
  setInterval(tickClock, 1000);
  refreshLongbridgeQuotes();
  refreshMarketData();
  setInterval(() => { randomWalk(); renderAll(); refreshLongbridgeQuotes(); refreshMarketData(); }, 60000);
}

boot();
