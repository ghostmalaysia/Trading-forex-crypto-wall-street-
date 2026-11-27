import { createHash } from 'node:crypto';

export const GENESIS_HASH = '0'.repeat(64);

export function stripChainFields(detail = {}) {
  const { seq, prev, hash, ...rest } = detail && typeof detail === 'object' ? detail : {};
  return rest;
}

export function auditHash(prev, seq, entry) {
  return createHash('sha256')
    .update(JSON.stringify({ prev: String(prev || GENESIS_HASH), seq: Number(seq), entry }))
    .digest('hex');
}

export function parseAuditLines(text) {
  return String(text || '')
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)
    .map((line, index) => {
      try { return { value: JSON.parse(line), index }; }
      catch { return { value: null, index }; }
    });
}

export function verifyAuditChain(text) {
  const rows = parseAuditLines(text);
  let previous = GENESIS_HASH;
  let expectedSeq = 0;
  for (const { value, index } of rows) {
    if (!value || typeof value !== 'object') {
      return { ok: false, count: rows.length, error: `Invalid JSON at line ${index + 1}` };
    }
    const { seq, prev, hash, ...entry } = value;
    expectedSeq += 1;
    if (Number(seq) !== expectedSeq) {
      return { ok: false, count: rows.length, error: `Sequence mismatch at line ${index + 1}` };
    }
    if (String(prev || '') !== previous) {
      return { ok: false, count: rows.length, error: `Chain break at line ${index + 1}` };
    }
    const expected = auditHash(prev, seq, entry);
    if (String(hash || '') !== expected) {
      return { ok: false, count: rows.length, error: `Hash mismatch at line ${index + 1}` };
    }
    previous = expected;
  }
  return { ok: true, count: rows.length, head: previous };
}
