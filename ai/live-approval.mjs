import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';

function text(value) {
  return String(value || '').trim();
}

export function safeEqual(left, right) {
  const a = Buffer.from(text(left));
  const b = Buffer.from(text(right));
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

function signature(payload, secret) {
  return createHmac('sha256', secret).update(payload).digest('hex');
}

export function createApproval(proposal, secret, ttlSeconds = 120) {
  if (!secret) throw new Error('LIVE_APPROVAL_SECRET is not configured on the server.');
  if (!proposal?.id || !proposal?.hash) throw new Error('A proposal with an id and hash is required.');
  const id = `apr-${randomUUID()}`;
  const expiresAt = new Date(Date.now() + Math.max(30, ttlSeconds) * 1000).toISOString();
  const payload = `${id}|${proposal.id}|${proposal.hash}|${expiresAt}`;
  const token = signature(payload, secret);
  return {
    id,
    proposalId: proposal.id,
    proposalHash: proposal.hash,
    expiresAt,
    token,
    code: token.slice(0, 8).toUpperCase(),
    status: 'issued',
  };
}

export function verifyApproval(approval, proposal, secret) {
  if (!secret) return { ok: false, reason: 'APPROVAL_SECRET_MISSING' };
  if (!approval || !proposal) return { ok: false, reason: 'APPROVAL_OR_PROPOSAL_MISSING' };
  const id = text(approval.id);
  const token = text(approval.token);
  const expiresAt = text(approval.expiresAt);
  const proposalId = text(proposal.id);
  const proposalHash = text(proposal.hash);
  if (proposalId !== text(approval.proposalId) || proposalHash !== text(approval.proposalHash)) {
    return { ok: false, reason: 'APPROVAL_PROPOSAL_MISMATCH' };
  }
  if (!expiresAt || Date.parse(expiresAt) <= Date.now()) return { ok: false, reason: 'APPROVAL_EXPIRED' };
  const payload = `${id}|${proposalId}|${proposalHash}|${expiresAt}`;
  if (!safeEqual(token, signature(payload, secret))) return { ok: false, reason: 'APPROVAL_SIGNATURE_INVALID' };
  return { ok: true, approvalId: id, proposalId };
}
