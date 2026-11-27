import { simulateFill } from './execution.mjs';

export function brokerStatus() {
  const configured = !!(process.env.METAAPI_TOKEN && process.env.METAAPI_ACCOUNT_ID);
  const liveRequested = process.env.ENABLE_LIVE_TRADING === 'true';
  return {
    mode: configured && liveRequested ? 'guarded-live-disabled' : 'paper',
    provider: configured ? 'metaapi' : 'paper-simulator',
    configured,
    liveRequested,
    liveOrdersEnabled: false,
    capabilities: {
      quotes: true,
      paperOrders: true,
      liveOrders: false,
    },
    notice: 'Broker adapters are scaffolded. Live order placement is disabled in this build; all executions are paper-only.',
  };
}

export const brokers = {
  paper: {
    async placeOrder(input) {
      return simulateFill(input);
    },
  },
  metaapi: {
    async placeOrder() {
      throw new Error('Live broker execution is disabled in this build. Use paper mode.');
    },
  },
};
