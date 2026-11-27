import { randomUUID } from 'node:crypto';
import { FOCUS } from '../shared/feed-data.js';

function digits(value) {
  return value > 100 ? 2 : 5;
}

export function simulateFill(input = {}) {
  const { plan, risk, context, confirmation } = input;
  if (confirmation !== 'EXECUTE PAPER') throw new Error('Type EXECUTE PAPER to simulate an order.');
  if (!plan || plan.paperOnly !== true) throw new Error('Only paper-only plans can be simulated.');
  if (risk?.decision !== 'pending_human_approval' || risk?.eligible !== true) throw new Error('Plan did not pass the risk gate.');
  const symbol = String(context?.selected || plan.symbol || '').toUpperCase();
  if (!FOCUS.includes(symbol)) throw new Error('Paper execution is limited to XAU/USD and DXY.');

  const entry = Number(plan.entry);
  const stopLoss = Number(plan.stopLoss);
  const takeProfit = Number(plan.takeProfit);
  const units = Number(plan.units);
  if (![entry, stopLoss, takeProfit, units].every(Number.isFinite) || entry <= 0 || units <= 0) {
    throw new Error('Plan has invalid entry, stop, target, or units.');
  }
  const side = takeProfit > entry ? 'buy' : 'sell';
  if (side === 'buy' && !(stopLoss < entry && takeProfit > entry)) throw new Error('Plan levels are not aligned for a buy.');
  if (side === 'sell' && !(stopLoss > entry && takeProfit < entry)) throw new Error('Plan levels are not aligned for a sell.');

  const slippagePct = context?.dataSource === 'market' ? 0.03 : 0.05;
  const direction = side === 'buy' ? 1 : -1;
  const fill = +(entry * (1 + direction * slippagePct / 100)).toFixed(digits(entry));
  return {
    id: `paper-${randomUUID()}`,
    symbol,
    side,
    entry: fill,
    plannedEntry: entry,
    stopLoss: +stopLoss.toFixed(digits(stopLoss)),
    takeProfit: +takeProfit.toFixed(digits(takeProfit)),
    units: +units.toFixed(2),
    riskPct: Number(plan.riskPct) || 0,
    status: 'simulated',
    paperOnly: true,
    slippagePct,
    executedAt: new Date().toISOString(),
    note: 'Simulated fill only. No broker order was placed.',
  };
}

export function evaluatePaperOrder(order, price) {
  const current = Number(price);
  if (!Number.isFinite(current) || current <= 0) throw new Error('Provide a valid current price.');
  const entry = Number(order?.entry);
  const stopLoss = Number(order?.stopLoss);
  const takeProfit = Number(order?.takeProfit);
  const units = Number(order?.units);
  if (![entry, stopLoss, takeProfit, units].every(Number.isFinite)) throw new Error('Order has invalid levels.');
  const side = order.side === 'sell' ? 'sell' : 'buy';
  const hitTarget = side === 'buy' ? current >= takeProfit : current <= takeProfit;
  const hitStop = side === 'buy' ? current <= stopLoss : current >= stopLoss;
  const outcome = hitTarget ? 'take_profit' : hitStop ? 'stop_loss' : current > entry ? 'in_profit' : current < entry ? 'in_loss' : 'flat';
  const pnl = (current - entry) * units * (side === 'buy' ? 1 : -1);
  return {
    orderId: order.id || null,
    symbol: order.symbol || null,
    price: +current.toFixed(digits(current)),
    outcome,
    pnl: +pnl.toFixed(2),
    evaluatedAt: new Date().toISOString(),
    paperOnly: true,
  };
}
