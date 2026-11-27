export class LiveCircuitBreaker {
  constructor(options = {}) {
    this.maxFailures = Math.max(1, Number(options.maxFailures) || 3);
    this.cooldownMs = Math.max(1000, Number(options.cooldownMs) || 300000);
    this.failures = 0;
    this.tripped = false;
    this.reason = '';
    this.trippedAt = null;
    this.lastFailureAt = null;
  }

  snapshot() {
    const remainingMs = this.trippedAt
      ? Math.max(0, this.trippedAt + this.cooldownMs - Date.now())
      : 0;
    return {
      tripped: this.tripped,
      reason: this.reason,
      failures: this.failures,
      maxFailures: this.maxFailures,
      cooldownSeconds: Math.round(this.cooldownMs / 1000),
      remainingSeconds: Math.ceil(remainingMs / 1000),
    };
  }

  assertClosed() {
    if (!this.tripped) return;
    if (this.trippedAt && Date.now() >= this.trippedAt + this.cooldownMs) {
      this.reset();
      return;
    }
    throw new Error(`Live circuit breaker is open: ${this.reason || 'manual trip'}`);
  }

  recordFailure(reason) {
    this.failures += 1;
    this.lastFailureAt = Date.now();
    if (this.failures >= this.maxFailures) this.trip(reason || 'repeated live order failures');
    return this.snapshot();
  }

  recordSuccess() {
    this.failures = 0;
    this.lastFailureAt = null;
    return this.snapshot();
  }

  trip(reason) {
    this.tripped = true;
    this.reason = String(reason || 'manual trip').slice(0, 160);
    this.trippedAt = Date.now();
    return this.snapshot();
  }

  reset() {
    this.tripped = false;
    this.reason = '';
    this.trippedAt = null;
    this.failures = 0;
    this.lastFailureAt = null;
    return this.snapshot();
  }
}
