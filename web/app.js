const MARKET = [
  { symbol: 'EUR/USD', market: 'Forex', price: 1.0842, change: 0.42, history: seed(1.0842, 0.0008) },
  { symbol: 'GBP/USD', market: 'Forex', price: 1.2735, change: -0.18, history: seed(1.2735, 0.0011) },
  { symbol: 'BTC/USD', market: 'Crypto', price: 68420, change: 1.85, history: seed(68420, 220) },
  { symbol: 'ETH/USD', market: 'Crypto', price: 3825, change: 2.14, history: seed(3825, 18) },
  { symbol: 'XAU/USD', market: 'Commodities', price: 2342.5, change: 0.63, history: seed(2342.5, 4.2) },
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

const state = { selected: 'BTC/USD', timeframe: '1D', userKey: null, memoryReady: false, provider: 'mock', providerDetail: '' };
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
  const status = document.querySelector('.sidebar-card small');
  if (status) status.textContent = state.provider === 'longbridge' ? 'Live quotes • Longbridge' : `Mock data${state.providerDetail ? ` • ${state.providerDetail}` : ' • no live provider connected'}`;
  const dot = document.querySelector('.sidebar-card .dot');
  if (dot) dot.classList.toggle('offline', state.provider !== 'longbridge');
}

function renderWatchlist() {
  $('watchlistBody').innerHTML = MARKET.map(m => `
    <tr class="${m.symbol === state.selected ? 'active' : ''}" data-symbol="${m.symbol}" tabindex="0" aria-label="Show ${m.symbol} chart">
      <td>${m.symbol}</td>
      <td>${fmtPrice(m.price)}</td>
      <td class="${m.change >= 0 ? 'up' : 'down'}">${fmtChange(m.change)}</td>
      <td>${m.market}</td>
    </tr>`).join('');
  document.querySelectorAll('#watchlistBody tr').forEach(tr => {
    const selectSymbol = () => {
      state.selected = tr.dataset.symbol;
      $('symbolSelect').value = state.selected;
      renderAll();
    };
    tr.addEventListener('click', selectSymbol);
    tr.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); selectSymbol(); }
    });
  });
}

function renderNews() {
  $('newsList').innerHTML = NEWS.map(n => `<div class="news-item"><h4>${n.title}</h4><p>${n.meta}</p></div>`).join('');
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

function drawChart() {
  const c = current();
  const data = seriesForTimeframe(c);
  const canvas = $('priceChart');
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  const cssW = canvas.clientWidth || 600;
  const cssH = 320;
  canvas.width = Math.floor(cssW * dpr); canvas.height = Math.floor(cssH * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, cssW, cssH);

  const pad = { l: 48, r: 16, t: 16, b: 28 };
  const min = Math.min(...data), max = Math.max(...data);
  const range = max - min || 1;
  const x = (i) => pad.l + (i / (data.length - 1)) * (cssW - pad.l - pad.r);
  const y = (v) => pad.t + (1 - (v - min) / range) * (cssH - pad.t - pad.b);

  ctx.strokeStyle = '#22314f'; ctx.lineWidth = 1;
  for (let i = 0; i < 5; i++) {
    const gy = pad.t + (i / 4) * (cssH - pad.t - pad.b);
    ctx.beginPath(); ctx.moveTo(pad.l, gy); ctx.lineTo(cssW - pad.r, gy); ctx.stroke();
    const val = max - (i / 4) * range;
    ctx.fillStyle = '#7f93b2'; ctx.font = '11px sans-serif'; ctx.fillText((c.price > 100 ? val.toFixed(0) : val.toFixed(4)), 6, gy + 4);
  }

  ctx.beginPath();
  data.forEach((v, i) => i ? ctx.lineTo(x(i), y(v)) : ctx.moveTo(x(i), y(v)));
  ctx.strokeStyle = c.change >= 0 ? '#2ecc71' : '#ff6b6b'; ctx.lineWidth = 2.2; ctx.stroke();

  const grad = ctx.createLinearGradient(0, pad.t, 0, cssH - pad.b);
  grad.addColorStop(0, c.change >= 0 ? 'rgba(46,204,113,.25)' : 'rgba(255,107,107,.22)');
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.lineTo(x(data.length - 1), cssH - pad.b); ctx.lineTo(x(0), cssH - pad.b); ctx.closePath();
  ctx.fillStyle = grad; ctx.fill();

  const last = data[data.length - 1];
  ctx.fillStyle = '#e6edf7'; ctx.beginPath(); ctx.arc(x(data.length - 1), y(last), 3.5, 0, Math.PI * 2); ctx.fill();

  $('chartTitle').textContent = `${c.symbol} Price Chart (${state.timeframe})`;
  const badge = $('chartChange');
  badge.textContent = fmtChange(c.change);
  badge.style.color = c.change >= 0 ? '#9ff0bf' : '#ffb3b3';
  badge.style.background = c.change >= 0 ? 'rgba(46,204,113,.12)' : 'rgba(255,107,107,.12)';
  badge.style.borderColor = c.change >= 0 ? 'rgba(46,204,113,.25)' : 'rgba(255,107,107,.25)';
  const source = c.dataSource === 'longbridge' ? 'Longbridge live quote' : 'Simulated data';
  $('chartMeta').innerHTML = `<span>Last: <strong>${fmtPrice(c.price)}</strong></span><span>High: ${fmtPrice(max)}</span><span>Low: ${fmtPrice(min)}</span><span>Source: ${source}</span>`;
}

function aiReply(text) {
  const t = text.toLowerCase();
  const c = current();
  if (t.includes('summary') || t.includes('market')) {
    return `Market summary (${c.symbol}): price ${fmtPrice(c.price)} (${fmtChange(c.change)} 24h). Breadth is ${MARKET.filter(m=>m.change>0).length}/${MARKET.length} positive. I can monitor moves and highlight news catalysts, but this is informational only.`;
  }
  if (t.includes('risk')) {
    return `Risk check: volatility varies by asset class. ${c.symbol} moved ${fmtChange(c.change)} today. Consider position sizing, stop-loss planning, and avoiding overexposure. I cannot provide financial advice or execute trades.`;
  }
  if (t.includes('news')) {
    return `Top news: ${NEWS[0].title}. Also watching: ${NEWS[1].title}. I can summarize impact by asset when real news APIs are connected.`;
  }
  if (t.includes('btc') || t.includes('crypto')) {
    const btc = MARKET.find(m => m.symbol === 'BTC/USD');
    return `BTC/USD is ${fmtPrice(btc.price)} (${fmtChange(btc.change)}). Crypto momentum is ${btc.change >= 0 ? 'positive' : 'weak'} in this mock feed. I can add alert thresholds in Phase 1.`;
  }
  return `I can help monitor ${c.symbol}, summarize news, and explain market moves. Ask for "market summary", "risk check", or "news". (Mock AI response; no execution.)`;
}

function addMsg(role, text) {
  const el = document.createElement('div');
  el.className = `msg ${role}`;
  el.textContent = text;
  $('chatLog').appendChild(el);
  $('chatLog').scrollTop = $('chatLog').scrollHeight;
}

async function initChat() {
  $('chatLog').innerHTML = '';
  addMsg('ai', 'Hello. I am your trading assistant (MVP mock). I can monitor watchlist moves, summarize news, and flag risk. I do not provide financial advice or execute trades.');
  if (window.SupabaseMemory?.enabled) {
    const hist = await window.SupabaseMemory.loadChat(state.userKey, 20);
    if (hist.ok && hist.data?.length) {
      $('chatLog').innerHTML = '';
      hist.data.forEach(m => addMsg(m.role === 'user' ? 'user' : 'ai', m.content));
    }
  }
  $('chatForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const text = $('chatInput').value.trim();
    if (!text) return;
    addMsg('user', text);
    $('chatInput').value = '';
    if (window.SupabaseMemory?.enabled) {
      window.SupabaseMemory.saveChat({ user_key: state.userKey, role: 'user', content: text, context: { symbol: state.selected, timeframe: state.timeframe } });
    }
    const reply = aiReply(text);
    setTimeout(async () => {
      addMsg('ai', reply);
      if (window.SupabaseMemory?.enabled) {
        window.SupabaseMemory.saveChat({ user_key: state.userKey, role: 'ai', content: reply, context: { symbol: state.selected, timeframe: state.timeframe } });
      }
    }, 250);
  });
}

function tickClock() { $('clock').textContent = new Date().toLocaleString(); }
function randomWalk() {
  MARKET.forEach(m => {
    if (m.dataSource === 'longbridge') return;
    const vol = m.price > 1000 ? 25 : m.price > 100 ? 8 : m.price > 10 ? 0.8 : 0.0009;
    const delta = (Math.random() - 0.5) * vol;
    m.price = +(m.price + delta).toFixed(m.price > 100 ? 2 : 5);
    m.change = +((m.price / m.referencePrice - 1) * 100).toFixed(2);
    m.history.push(m.price);
    if (m.history.length > 60) m.history.shift();
  });
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

function renderAll() { renderStats(); renderWatchlist(); renderNews(); drawChart(); }

async function persistProfile() {
  if (!window.SupabaseMemory?.enabled) return;
  await window.SupabaseMemory.saveProfile({
    user_key: state.userKey,
    preferences: { theme: 'dark', default_symbol: state.selected, timeframe: state.timeframe }
  });
}

function bind() {
  $('symbolSelect').addEventListener('change', async e => { state.selected = e.target.value; renderAll(); await persistProfile(); });
  $('timeframeSelect').addEventListener('change', async e => { state.timeframe = e.target.value; drawChart(); await persistProfile(); });
  $('refreshBtn').addEventListener('click', () => { randomWalk(); renderAll(); refreshLongbridgeQuotes(); });
  document.querySelectorAll('.nav a').forEach(link => link.addEventListener('click', () => {
    document.querySelectorAll('.nav a').forEach(item => item.classList.toggle('active', item === link));
  }));
  window.addEventListener('resize', drawChart);
}

async function boot() {
  state.userKey = window.SupabaseMemory?.getUserKey?.() || localStorage.getItem('tradewall_user_key') || 'local';
  if (!localStorage.getItem('tradewall_user_key')) localStorage.setItem('tradewall_user_key', state.userKey);
  renderControls();
  bind();
  renderAll();
  tickClock();
  await initChat();
  if (window.SupabaseMemory?.enabled) {
    state.memoryReady = true;
    await persistProfile();
    await window.SupabaseMemory.saveWatchlist(MARKET.map(m => ({ user_key: state.userKey, symbol: m.symbol, market: m.market })));
    const note = document.querySelector('.sidebar-card small');
    if (note) note.textContent = 'Supabase cloud memory connected';
  } else {
    const note = document.querySelector('.sidebar-card small');
    if (note) note.textContent = 'Local mock mode • Configure Supabase for cloud memory';
  }
  setInterval(tickClock, 1000);
  refreshLongbridgeQuotes();
  setInterval(() => { randomWalk(); renderAll(); refreshLongbridgeQuotes(); }, 15000);
}

boot();
