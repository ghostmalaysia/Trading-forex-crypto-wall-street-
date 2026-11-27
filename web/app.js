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

const FOCUS = ['XAU/USD', 'DXY'];
const state = { selected: 'XAU/USD', timeframe: '1D', userKey: null, memoryReady: false, provider: 'mock', providerDetail: '', configEditing: false, lessons: [], history: [], currentPlan: null, aiProvider: 'local', aiModel: 'rules' };
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
  const status = document.querySelector('.sidebar-card small');
  if (status) status.textContent = state.provider === 'longbridge' ? 'Live quotes • Longbridge' : `Mock data${state.providerDetail ? ` • ${state.providerDetail}` : ' • no live provider connected'}`;
  const dot = document.querySelector('.sidebar-card .dot');
  if (dot) dot.classList.toggle('offline', state.provider !== 'longbridge');
  const barProvider = $('statusProvider');
  if (barProvider) barProvider.textContent = state.provider === 'longbridge' ? 'LIVE LONGBRIDGE' : 'SIMULATED';
  const barDot = $('statusDot');
  if (barDot) barDot.classList.toggle('offline', state.provider !== 'longbridge');
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

  ctx.strokeStyle = '#162237'; ctx.lineWidth = 1;
  for (let i = 0; i < 5; i++) {
    const gy = pad.t + (i / 4) * (cssH - pad.t - pad.b);
    ctx.beginPath(); ctx.moveTo(pad.l, gy); ctx.lineTo(cssW - pad.r, gy); ctx.stroke();
    const val = max - (i / 4) * range;
    ctx.fillStyle = '#7589a5'; ctx.font = '10px monospace'; ctx.fillText((c.price > 100 ? val.toFixed(0) : val.toFixed(4)), 6, gy + 4);
  }

  ctx.beginPath();
  data.forEach((v, i) => i ? ctx.lineTo(x(i), y(v)) : ctx.moveTo(x(i), y(v)));
  ctx.strokeStyle = c.change >= 0 ? '#00d68f' : '#ff4d5e'; ctx.lineWidth = 2; ctx.stroke();

  const grad = ctx.createLinearGradient(0, pad.t, 0, cssH - pad.b);
  grad.addColorStop(0, c.change >= 0 ? 'rgba(0,214,143,.22)' : 'rgba(255,77,94,.2)');
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.lineTo(x(data.length - 1), cssH - pad.b); ctx.lineTo(x(0), cssH - pad.b); ctx.closePath();
  ctx.fillStyle = grad; ctx.fill();

  const last = data[data.length - 1];
  ctx.fillStyle = '#22d3ee'; ctx.beginPath(); ctx.arc(x(data.length - 1), y(last), 3.5, 0, Math.PI * 2); ctx.fill();

  $('chartTitle').textContent = `${c.symbol} Price Chart (${state.timeframe})`;
  const badge = $('chartChange');
  badge.textContent = fmtChange(c.change);
  badge.style.color = c.change >= 0 ? '#9ff0bf' : '#ffb3b3';
  badge.style.background = c.change >= 0 ? 'rgba(46,204,113,.12)' : 'rgba(255,107,107,.12)';
  badge.style.borderColor = c.change >= 0 ? 'rgba(46,204,113,.25)' : 'rgba(255,107,107,.25)';
  const source = c.dataSource === 'longbridge' ? 'Longbridge live quote' : 'Simulated data';
  const sourceEl = $('chartSource');
  if (sourceEl) { sourceEl.textContent = c.dataSource === 'longbridge' ? 'LIVE' : 'SIM'; sourceEl.classList.toggle('live', c.dataSource === 'longbridge'); }
  $('chartMeta').innerHTML = `<span>Last: <strong>${fmtPrice(c.price)}</strong></span><span>High: ${fmtPrice(max)}</span><span>Low: ${fmtPrice(min)}</span><span>Source: ${source}</span>`;
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
      if (mode === 'plan' && data.plan) { state.currentPlan = data; renderPlan(data); }
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

function renderAll() { renderStats(); renderTicker(); renderWatchlist(); renderNews(); drawChart(); }

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
  $('symbolSelect').addEventListener('change', async e => { state.selected = e.target.value; resetPlan(); renderAll(); await persistProfile(); });
  $('timeframeSelect').addEventListener('change', async e => { state.timeframe = e.target.value; resetPlan(); drawChart(); await persistProfile(); });
  $('refreshBtn').addEventListener('click', () => { randomWalk(); renderAll(); refreshLongbridgeQuotes(); });
  $('planBtn').addEventListener('click', submitPlan);
  $('approvePlanBtn').addEventListener('click', () => decidePlan('approved'));
  $('rejectPlanBtn').addEventListener('click', () => decidePlan('rejected'));
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
    updateAuthUI();
    await initChat();
  });
  document.querySelectorAll('.nav a').forEach(link => link.addEventListener('click', () => {
    document.querySelectorAll('.nav a').forEach(item => item.classList.toggle('active', item === link));
  }));
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
  if (window.SupabaseMemory?.enabled) {
    state.memoryReady = true;
    await persistProfile();
    try {
      await window.SupabaseMemory.saveWatchlist(MARKET.map(m => ({ user_key: state.userKey, symbol: m.symbol, market: m.market })));
    } catch { setAuthStatus('Signed in, but watchlist sync failed. Check the Supabase migration and RLS policies.'); }
  }
  setInterval(tickClock, 1000);
  refreshLongbridgeQuotes();
  setInterval(() => { randomWalk(); renderAll(); refreshLongbridgeQuotes(); }, 15000);
}

boot();
