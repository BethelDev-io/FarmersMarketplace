import React from 'react';
import { s } from './walletStyles';

/** Returns a human-readable description of a Stellar claimant predicate */
function describeCondition(predicate) {
  if (!predicate || predicate.unconditional) return 'Claimable now';
  if (predicate.not) {
    const inner = predicate.not;
    if (inner.abs_before) {
      return `Claimable after ${new Date(inner.abs_before).toLocaleString()}`;
    }
    if (inner.rel_before) {
      const days = Math.round(inner.rel_before / 86400);
      return `Claimable after ~${days} day${days !== 1 ? 's' : ''}`;
    }
  }
  if (predicate.abs_before) {
    return `Claimable until ${new Date(predicate.abs_before).toLocaleString()}`;
  }
  return 'Conditional';
}

/** Pending claims section: claimable balances from pre-orders / escrow refunds. */
export default function ClaimableBalances({ balances, loading, claimingId, onClaim }) {
  if (!loading && balances.length === 0) return null;

  return (
    <div style={s.card} data-testid="pending-claims-section">
      <h3 style={{ marginBottom: 4, color: 'var(--color-text)' }}>⏳ Pending Claims</h3>
      <p style={{ fontSize: 13, color: 'var(--color-text-muted)', marginBottom: 16 }}>
        Funds locked in Stellar claimable balances (e.g. pre-order refunds) waiting to be claimed.
      </p>
      {loading ? (
        <p style={{ color: 'var(--color-text-faint)', fontSize: 14 }}>Loading...</p>
      ) : (
        <div>
          {balances.map(b => {
            const isClaiming = claimingId === b.id;
            const shortId = b.id.length > 16
              ? `${b.id.slice(0, 8)}…${b.id.slice(-6)}`
              : b.id;
            const condition = describeCondition(b.claimant_condition);
            return (
              <div
                key={b.id}
                data-testid="claimable-balance-row"
                style={{
                  borderBottom: '1px solid var(--color-border)',
                  padding: '12px 0',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: 12,
                  flexWrap: 'wrap',
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontFamily: 'monospace', fontSize: 12, color: 'var(--color-text-muted)', marginBottom: 3, wordBreak: 'break-all' }}>
                    ID: {shortId}
                  </div>
                  <div style={{ fontWeight: 700, fontSize: 16, color: 'var(--color-primary)' }}>
                    {parseFloat(b.amount).toFixed(2)} XLM
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 2 }}>
                    {condition}
                  </div>
                </div>
                <button
                  data-testid={`claim-btn-${b.id}`}
                  style={{
                    background: isClaiming ? 'var(--color-text-muted)' : 'var(--color-primary)',
                    color: 'var(--color-on-primary)',
                    border: 'none',
                    borderRadius: 8,
                    padding: '9px 20px',
                    cursor: isClaiming ? 'not-allowed' : 'pointer',
                    fontWeight: 600,
                    fontSize: 14,
                    minHeight: 44,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    flexShrink: 0,
                  }}
                  onClick={() => onClaim(b.id)}
                  disabled={isClaiming}
                  aria-busy={isClaiming}
                  aria-label={`Claim ${parseFloat(b.amount).toFixed(2)} XLM`}
                >
                  {isClaiming && (
                    <span
                      style={{
                        display: 'inline-block',
                        width: 14,
                        height: 14,
                        border: '2px solid rgba(255,255,255,0.35)',
                        borderTopColor: 'var(--color-on-primary)',
                        borderRadius: '50%',
                        animation: 'spin 0.6s linear infinite',
                      }}
                      aria-hidden="true"
                    />
                  )}
                  {isClaiming ? 'Claiming…' : 'Claim'}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
