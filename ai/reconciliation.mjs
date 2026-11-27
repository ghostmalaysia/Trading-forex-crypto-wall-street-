function safeRef(value) {
  return String(value || '').trim();
}

export function summarizeReconciliation(localOrders = [], brokerOrders = []) {
  const local = (Array.isArray(localOrders) ? localOrders : []).map(order => ({
    id: safeRef(order.id || order.orderId || order.order_ref),
    status: safeRef(order.status) || 'unknown',
  })).filter(order => order.id);
  const remote = (Array.isArray(brokerOrders) ? brokerOrders : []).map(order => ({
    id: safeRef(order.id || order.orderId || order.order_ref),
    status: safeRef(order.status) || 'unknown',
  })).filter(order => order.id);
  const remoteById = new Map(remote.map(order => [order.id, order]));
  const missing = local.filter(order => !remoteById.has(order.id)).map(order => order.id);
  const statusMismatch = local.filter(order => {
    const brokerOrder = remoteById.get(order.id);
    return brokerOrder && brokerOrder.status !== order.status;
  }).map(order => ({ id: order.id, localStatus: order.status, brokerStatus: remoteById.get(order.id).status }));
  const unexpected = remote.filter(order => !local.some(item => item.id === order.id)).map(order => order.id);
  return {
    localCount: local.length,
    brokerCount: remote.length,
    missing,
    statusMismatch,
    unexpected,
    matched: missing.length === 0 && statusMismatch.length === 0 && unexpected.length === 0,
  };
}
